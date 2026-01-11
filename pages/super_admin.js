import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import StaffSettingsModal from '../components/StaffSettingsModal';
import PortalLayout from '../components/PortalLayout';

const CLASS_OPTIONS = ['Nursery', 'UKG', 'LKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const buildEmptyChargeMap = (withExtras = false) =>
  CLASS_OPTIONS.reduce(
    (acc, className) => ({
      ...acc,
      [className]: {
        monthlyFees: 0,
        kitCharges: 0,
        storeCharges: 0,
        annualCharges: 0,
        ...(withExtras
          ? { admissionCharges: 0, registrationFees: 0 }
          : {}),
      },
    }),
    {},
  );

const emptyCharges = {
  new: buildEmptyChargeMap(true),
  old: buildEmptyChargeMap(false),
};

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
        <span className="rounded-full bg-portal/10 px-3 py-1 text-[11px] font-semibold text-portal">Auto-save</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {CLASS_OPTIONS.map((className) => (
          <button
            key={className}
            type="button"
            onClick={() => setActiveClass(className)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              activeClass === className
                ? 'bg-portal text-white shadow'
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
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-portal focus:outline-none focus:ring-2 focus:ring-portal/20"
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
          const studentSettings = data.students || {};
          const resolvedNew = studentSettings.new || studentSettings.newAdmission || {};
          const resolvedOld = studentSettings.old || studentSettings.oldAdmission || studentSettings || {};
          setCharges({
            new: { ...emptyCharges.new, ...resolvedNew },
            old: { ...emptyCharges.old, ...resolvedOld },
          });
        }
        setLoadingCharges(false);
      },
      () => setLoadingCharges(false),
    );
    return () => unsub();
  }, []);

  const handleChargeChange = async (admissionType, className, field, value) => {
    setSaving(true);
    setCharges((prev) => {
      const updatedType = {
        ...prev[admissionType],
        [className]: { ...prev[admissionType][className], [field]: value },
      };
      const nextCharges = { ...prev, [admissionType]: updatedType };
      setDoc(doc(db, 'settings', 'super_admin'), { students: nextCharges }, { merge: true })
        .catch(() => setSaving(false))
        .finally(() => setSaving(false));
      return nextCharges;
    });
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/');
  };

  const studentCharges = useMemo(() => charges, [charges]);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-portal">
        <p className="text-sm font-semibold">Loading super admin portal…</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <PortalLayout
      sidebar={
        <>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Image src="/elnode.png" alt="EL-NODE logo" width={32} height={32} className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-300">Super Admin</p>
              <h1 className="text-xl font-semibold text-white">Central Controls</h1>
            </div>
          </div>
          <div className="space-y-2 rounded-2xl bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-300">Actions</p>
            <button
              type="button"
              onClick={() => setShowStaffModal(true)}
              className="w-full rounded-xl bg-white/10 px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Manage Teachers & Staff
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-xl bg-white/10 px-3 py-2 text-left text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Sign out
            </button>
          </div>
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-slate-300">Menu</p>
            {[
              { id: 'students', label: 'Students' },
              { id: 'teachers', label: 'Teachers' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full rounded-xl px-4 py-2 text-left text-sm font-semibold transition ${
                  activeTab === item.id ? 'bg-portal text-white shadow' : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {activeTab === 'students' && (
            <div className="space-y-2 rounded-2xl bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-300">Student submenu</p>
              {[
                { id: 'new', label: 'New admission' },
                { id: 'old', label: 'Old admission' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStudentTab(item.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                    studentTab === item.id
                      ? 'bg-white text-portal shadow'
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </>
      }
    >
      <Head>
        <title>Super Admin Portal</title>
      </Head>

      <div className="space-y-6">
        {activeTab === 'students' && (
          <div className="space-y-4">
            {loadingCharges ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                Loading fee settings…
              </div>
            ) : (
              <ChargeEditor
                label={studentTab === 'new' ? 'New admission settings' : 'Old admission settings'}
                charges={studentCharges[studentTab]}
                onChange={(className, field, value) =>
                  handleChargeChange(studentTab, className, field, value)
                }
                extraFields={studentTab === 'new'}
              />
            )}
            {saving && (
              <p className="text-xs font-semibold text-portal">Saving changes…</p>
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
                className="rounded-xl bg-portal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-portal/90"
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
      </div>

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
    </PortalLayout>
  );
};

export default SuperAdminPortal;
