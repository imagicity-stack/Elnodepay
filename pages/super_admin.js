import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import StaffSettingsModal from '../components/StaffSettingsModal';
import PortalLayout from '../components/PortalLayout';

const CLASS_OPTIONS = ['Nursery', 'UKG', 'LKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const buildEmptyCoreAcademics = () =>
  CLASS_OPTIONS.reduce(
    (acc, className) => ({
      ...acc,
      [className]: {
        monthlyFees: 0,
        registrationFees: 0,
        annualCharges: 0,
      },
    }),
    {},
  );

const buildEmptyStoreForms = () =>
  CLASS_OPTIONS.reduce(
    (acc, className) => ({
      ...acc,
      [className]: { category: '', itemName: '', price: '' },
    }),
    {},
  );

const CoreAcademicsEditor = ({ label, charges, onChange, onSave, savingClass }) => {
  const [activeClass, setActiveClass] = useState(CLASS_OPTIONS[0]);
  const fields = [
    { id: 'monthlyFees', label: 'Monthly fees' },
    { id: 'registrationFees', label: 'Registration fees' },
    { id: 'annualCharges', label: 'Annual charges' },
  ];

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <h3 className="text-lg font-semibold text-slate-900">Class-wise structure</h3>
          <p className="text-xs text-slate-500">Confirm and save fees for each class.</p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-700">Confirm &amp; save</span>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Selected: <span className="font-semibold text-slate-700">Class {activeClass}</span>
        </p>
        <button
          type="button"
          onClick={() => onSave(activeClass)}
          disabled={savingClass === activeClass}
          className="rounded-xl bg-portal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-portal/90 disabled:cursor-not-allowed disabled:bg-portal/50"
        >
          {savingClass === activeClass ? 'Saving…' : 'Save class fees'}
        </button>
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
  const [studentTab, setStudentTab] = useState('core-academics');
  const [coreAcademics, setCoreAcademics] = useState(buildEmptyCoreAcademics());
  const [coreAcademicsDraft, setCoreAcademicsDraft] = useState(buildEmptyCoreAcademics());
  const [loadingCharges, setLoadingCharges] = useState(true);
  const [savingClass, setSavingClass] = useState('');
  const [storeForms, setStoreForms] = useState(buildEmptyStoreForms());
  const [storeItems, setStoreItems] = useState([]);
  const [savingStoreClass, setSavingStoreClass] = useState('');
  const [storeFormErrors, setStoreFormErrors] = useState({});
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
          const resolvedCore =
            studentSettings.coreAcademics ||
            studentSettings.core_academics ||
            studentSettings.new ||
            studentSettings.newAdmission ||
            studentSettings.old ||
            studentSettings.oldAdmission ||
            studentSettings ||
            {};
          const nextCore = CLASS_OPTIONS.reduce(
            (acc, className) => ({
              ...acc,
              [className]: {
                monthlyFees: Number(resolvedCore?.[className]?.monthlyFees || 0),
                registrationFees: Number(resolvedCore?.[className]?.registrationFees || 0),
                annualCharges: Number(resolvedCore?.[className]?.annualCharges || 0),
              },
            }),
            {},
          );
          setCoreAcademics(nextCore);
          setCoreAcademicsDraft(nextCore);
        }
        setLoadingCharges(false);
      },
      () => setLoadingCharges(false),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const storeQuery = query(collection(db, 'store_items'), orderBy('created_at', 'desc'));
    const unsub = onSnapshot(storeQuery, (snap) => {
      const data = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setStoreItems(data);
    });
    return () => unsub();
  }, []);

  const handleCoreChange = (className, field, value) => {
    setCoreAcademicsDraft((prev) => ({
      ...prev,
      [className]: { ...prev[className], [field]: value },
    }));
  };

  const handleSaveCoreClass = async (className) => {
    if (typeof window !== 'undefined') {
      const confirmSave = window.confirm(`Save core academic fees for Class ${className}?`);
      if (!confirmSave) return;
    }
    setSavingClass(className);
    const nextCore = {
      ...coreAcademics,
      [className]: { ...coreAcademicsDraft[className] },
    };
    try {
      await setDoc(
        doc(db, 'settings', 'super_admin'),
        { students: { coreAcademics: nextCore } },
        { merge: true },
      );
      setCoreAcademics(nextCore);
    } finally {
      setSavingClass('');
    }
  };

  const handleStoreFormChange = (className, field, value) => {
    setStoreForms((prev) => ({
      ...prev,
      [className]: { ...prev[className], [field]: value },
    }));
    setStoreFormErrors((prev) => ({ ...prev, [className]: '' }));
  };

  const handleSaveStoreItem = async (className) => {
    const payload = storeForms[className] || {};
    const category = (payload.category || '').trim();
    const itemName = (payload.itemName || '').trim();
    const priceValue = Number(payload.price || 0);
    if (!category || !itemName || !(priceValue > 0)) {
      setStoreFormErrors((prev) => ({
        ...prev,
        [className]: 'Enter a category, item name, and price greater than zero.',
      }));
      return;
    }
    if (typeof window !== 'undefined') {
      const confirmSave = window.confirm(
        `Save store item for Class ${className}?\n${category} · ${itemName} · ₹${priceValue.toLocaleString('en-IN')}`,
      );
      if (!confirmSave) return;
    }
    setSavingStoreClass(className);
    try {
      await addDoc(collection(db, 'store_items'), {
        className,
        category,
        itemName,
        price: priceValue,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      setStoreForms((prev) => ({
        ...prev,
        [className]: { category: '', itemName: '', price: '' },
      }));
    } finally {
      setSavingStoreClass('');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/');
  };

  const storeItemsByClass = useMemo(() => {
    const map = new Map();
    storeItems.forEach((item) => {
      const className = item.className || item.class || '';
      if (!className) return;
      if (!map.has(className)) {
        map.set(className, []);
      }
      map.get(className).push(item);
    });
    return map;
  }, [storeItems]);

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
          <div className="flex items-center gap-3 border border-slate-700/60 bg-slate-900/40 px-4 py-3">
            <div className="flex h-12 w-12 items-center justify-center border border-slate-700 bg-slate-900/40">
              <Image src="/elnode.png" alt="EL-NODE logo" width={32} height={32} className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-300">Super Admin</p>
              <h1 className="text-xl font-semibold text-white">Central Controls</h1>
            </div>
          </div>
          <div className="space-y-2 border border-slate-700/60 bg-slate-900/40 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-300">Actions</p>
            <button
              type="button"
              onClick={() => setShowStaffModal(true)}
              className="group flex w-full items-center gap-3 border border-transparent px-3 py-2 text-left text-xs font-semibold text-white transition hover:border-slate-600/70 hover:bg-white/5"
            >
              <img
                src="/icons/sidebar/settings.svg"
                alt=""
                className="h-4 w-4 opacity-80 transition group-hover:opacity-100"
                aria-hidden="true"
              />
              Manage Teachers & Staff
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="group flex w-full items-center gap-3 border border-transparent px-3 py-2 text-left text-xs font-semibold text-white transition hover:border-slate-600/70 hover:bg-white/5"
            >
              <img
                src="/icons/sidebar/logout.svg"
                alt=""
                className="h-4 w-4 opacity-80 transition group-hover:opacity-100"
                aria-hidden="true"
              />
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
                className={`group flex w-full items-center gap-3 border px-4 py-2 text-left text-sm font-semibold transition ${
                  activeTab === item.id
                    ? 'border-portal/70 bg-white/10 text-white'
                    : 'border-transparent text-slate-200 hover:border-slate-600/70 hover:bg-white/5'
                }`}
              >
                <img
                  src={item.id === 'students' ? '/icons/sidebar/users.svg' : '/icons/sidebar/user-check.svg'}
                  alt=""
                  className={`h-4 w-4 transition ${activeTab === item.id ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}
                  aria-hidden="true"
                />
                {item.label}
              </button>
            ))}
          </div>
          {activeTab === 'students' && (
            <div className="space-y-2 border border-slate-700/60 bg-slate-900/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-300">Student submenu</p>
              {[
                { id: 'core-academics', label: 'Core academics' },
                { id: 'store', label: 'Store' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStudentTab(item.id)}
                  className={`w-full border px-3 py-2 text-left text-xs font-semibold transition ${
                    studentTab === item.id
                      ? 'border-portal/70 bg-white/10 text-white'
                      : 'border-transparent text-slate-200 hover:border-slate-600/70 hover:bg-white/5'
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
              <>
                {studentTab === 'core-academics' && (
                  <CoreAcademicsEditor
                    label="Core academics"
                    charges={coreAcademicsDraft}
                    onChange={(className, field, value) => handleCoreChange(className, field, value)}
                    onSave={handleSaveCoreClass}
                    savingClass={savingClass}
                  />
                )}
                {studentTab === 'store' && (
                  <div className="space-y-4">
                    {CLASS_OPTIONS.map((className) => {
                      const items = storeItemsByClass.get(className) || [];
                      return (
                        <div
                          key={className}
                          className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Store</p>
                              <h3 className="text-lg font-semibold text-slate-900">Class {className}</h3>
                              <p className="text-xs text-slate-500">Create a category, item, and price.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSaveStoreItem(className)}
                              disabled={savingStoreClass === className}
                              className="rounded-xl bg-portal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-portal/90 disabled:cursor-not-allowed disabled:bg-portal/50"
                            >
                              {savingStoreClass === className ? 'Saving…' : 'Save store item'}
                            </button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                              <span>Category</span>
                              <input
                                type="text"
                                value={storeForms[className]?.category || ''}
                                onChange={(event) => handleStoreFormChange(className, 'category', event.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-portal focus:outline-none focus:ring-2 focus:ring-portal/20"
                                placeholder="e.g. Books"
                              />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                              <span>Item name</span>
                              <input
                                type="text"
                                value={storeForms[className]?.itemName || ''}
                                onChange={(event) => handleStoreFormChange(className, 'itemName', event.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-portal focus:outline-none focus:ring-2 focus:ring-portal/20"
                                placeholder="e.g. Science workbook"
                              />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                              <span>Price (₹)</span>
                              <input
                                type="number"
                                min="0"
                                value={storeForms[className]?.price || ''}
                                onChange={(event) => handleStoreFormChange(className, 'price', event.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-portal focus:outline-none focus:ring-2 focus:ring-portal/20"
                                placeholder="0"
                              />
                            </label>
                          </div>
                          {storeFormErrors[className] && (
                            <p className="text-xs font-semibold text-rose-600">{storeFormErrors[className]}</p>
                          )}
                          {items.length > 0 ? (
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved items</p>
                              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                                {items.slice(0, 5).map((item) => (
                                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                                    <span>
                                      <span className="font-semibold text-slate-900">{item.category}</span> · {item.itemName}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-500">
                                      ₹{Number(item.price || 0).toLocaleString('en-IN')}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">No store items saved for this class yet.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
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
