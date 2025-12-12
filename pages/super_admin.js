import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import StaffSettingsModal from '../components/StaffSettingsModal';

const CLASS_OPTIONS = ['Nursery', 'UKG', 'LKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const emptyCharges = CLASS_OPTIONS.reduce(
  (acc, className) => ({
    ...acc,
    [className]: {
      monthlyFees: 0,
      kitCharges: 0,
      storeCharges: 0,
      annualCharges: 0,
      admissionCharges: 0,
      registrationFees: 0,
    },
  }),
  {},
);

const Tabs = ({ items, active, onChange }) => (
  <div className="flex flex-wrap gap-2" role="tablist">
    {items.map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onChange(tab.id)}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
          active === tab.id ? 'bg-cardinal text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

const ChargeEditor = ({ label, charges, onChange, extraFields = false }) => {
  const [activeClass, setActiveClass] = useState(CLASS_OPTIONS[0]);
  const fields = [
    { id: 'monthlyFees', label: 'Monthly fees' },
    { id: 'kitCharges', label: 'Kit charges' },
    { id: 'storeCharges', label: 'Store charges' },
    { id: 'annualCharges', label: 'Annual charges' },
  ];
  if (extraFields) {
    fields.push({ id: 'admissionCharges', label: 'Admission charges' });
    fields.push({ id: 'registrationFees', label: 'Registration fees' });
  }

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <h3 className="text-lg font-semibold text-slate-900">Class-wise structure</h3>
          <p className="text-xs text-slate-500">Update default fee heads for this admission path.</p>
        </div>
        <span className="rounded-full bg-cardinal/10 px-3 py-1 text-[11px] font-semibold text-cardinal">Auto-save</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {CLASS_OPTIONS.map((className) => (
          <button
            key={className}
            type="button"
            onClick={() => setActiveClass(className)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              activeClass === className
                ? 'bg-cardinal text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Class {className}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => (
          <label key={field.id} className="space-y-1 text-sm font-semibold text-slate-700">
            <span>{field.label}</span>
            <input
              type="number"
              min="0"
              value={charges[activeClass]?.[field.id] ?? 0}
              onChange={(event) =>
                onChange(activeClass, field.id, Number(event.target.value) || 0)
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </label>
        ))}
      </div>
    </div>
  );
};

const SuperAdminPortal = () => {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [roleError, setRoleError] = useState('');
  const [activeTab, setActiveTab] = useState('students');
  const [studentTab, setStudentTab] = useState('new');
  const [charges, setCharges] = useState(emptyCharges);
  const [loadingCharges, setLoadingCharges] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setAuthChecked(true);
        router.replace('/');
        return;
      }
      const profile = await getDoc(doc(db, 'users', currentUser.uid));
      if (!profile.exists() || profile.data().role !== 'super_admin') {
        setRoleError('You need super admin access to view this page.');
        setAuthChecked(true);
        router.replace('/unauthorized');
        return;
      }
      setUser(currentUser);
      setAuthChecked(true);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'super_admin');
    const unsub = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setCharges({ ...emptyCharges, ...(data.students || emptyCharges) });
        }
        setLoadingCharges(false);
      },
      () => setLoadingCharges(false),
    );
    return () => unsub();
  }, []);

  const handleChargeChange = async (className, field, value) => {
    setCharges((prev) => ({
      ...prev,
      [className]: { ...prev[className], [field]: value },
    }));
    setSaving(true);
    const payload = {
      students: {
        ...charges,
        [className]: { ...charges[className], [field]: value },
      },
    };
    await setDoc(doc(db, 'settings', 'super_admin'), payload, { merge: true });
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/');
  };

  const studentCharges = useMemo(
    () => ({
      new: charges,
      old: charges,
    }),
    [charges],
  );

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-cardinal">
        <p className="text-sm font-semibold">Loading super admin portal…</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-slate-50">
      <Head>
        <title>Super Admin Portal</title>
      </Head>
      <header className="border-b border-white/60 bg-white/80 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Image src="/elnode.png" alt="EL-NODE logo" width={40} height={40} className="h-10 w-10" />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Super Admin</p>
              <h1 className="text-xl font-semibold text-slate-900">Central Controls</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowStaffModal(true)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Manage Teachers & Staff
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-4">
          <Tabs
            items={[
              { id: 'students', label: 'Students' },
              { id: 'teachers', label: 'Teachers' },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {activeTab === 'students' && (
          <div className="space-y-4">
            <Tabs
              items={[
                { id: 'new', label: 'New admission' },
                { id: 'old', label: 'Old admission' },
              ]}
              active={studentTab}
              onChange={setStudentTab}
            />
            {loadingCharges ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                Loading fee settings…
              </div>
            ) : (
              <ChargeEditor
                label={studentTab === 'new' ? 'New admission settings' : 'Old admission settings'}
                charges={studentCharges[studentTab]}
                onChange={handleChargeChange}
                extraFields={studentTab === 'new'}
              />
            )}
            {saving && (
              <p className="text-xs font-semibold text-cardinal">Saving changes…</p>
            )}
          </div>
        )}

        {activeTab === 'teachers' && (
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teachers</p>
                <h3 className="text-lg font-semibold text-slate-900">Add or update staff</h3>
                <p className="text-sm text-slate-600">The same workflow from the accountant portal now lives here.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowStaffModal(true)}
                className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90"
              >
                Add teacher / staff
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Use the staff modal to create teaching or non-teaching staff. Accounts are provisioned in Firebase Authentication
              when an email is provided.
            </p>
          </div>
        )}
      </main>

      <StaffSettingsModal
        open={showStaffModal}
        onClose={() => setShowStaffModal(false)}
        secondaryAuth={null}
      />

      {roleError && (
        <div className="fixed bottom-6 right-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-lg">
          {roleError}
        </div>
      )}
    </div>
  );
};

export default SuperAdminPortal;
