import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  createUserWithEmailAndPassword,
  getAuth as getFirebaseAuth,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getApps, initializeApp } from 'firebase/app';
import { auth, db } from '../lib/firebase';

const CLASS_OPTIONS = ['Nursery', 'KG1', 'KG2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const FEE_TYPE_OPTIONS = ['Monthly', 'Quarterly', '6 Months', 'Custom'];

const toInputString = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  return '';
};

const buildFeeStructureDraft = (structure = {}) =>
  CLASS_OPTIONS.reduce((acc, classKey) => {
    const entry = structure[classKey] || {};
    acc[classKey] = {
      monthly: toInputString(entry.monthly),
      quarterly: toInputString(entry.quarterly),
      sixmonth: toInputString(entry.sixmonth ?? entry['6month']),
    };
    return acc;
  }, {});

const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

const resolveTransactionDate = (entry) => {
  if (!entry) return null;
  if (entry.date?.toDate) {
    const asDate = entry.date.toDate();
    return Number.isFinite(asDate.getTime()) ? asDate : null;
  }
  if (entry.date) {
    const asDate = new Date(entry.date);
    return Number.isFinite(asDate.getTime()) ? asDate : null;
  }
  return null;
};

const resolveTransactionMonthKey = (entry) => {
  if (!entry) return '';
  if (entry.month && typeof entry.month === 'string') {
    return entry.month;
  }
  const date = resolveTransactionDate(entry);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const resolveTransactionMonthLabel = (entry) => {
  if (!entry) return '';
  if (entry.month && typeof entry.month === 'string') {
    return entry.month;
  }
  const date = resolveTransactionDate(entry);
  if (!date) return '';
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
};

const emptyStudentForm = {
  studentId: '',
  name: '',
  class: '',
  section: '',
  parent_phone: '',
  parent_email: '',
};

const defaultFeeRequestForm = {
  feeType: 'Monthly',
  customAmount: '',
  customNote: '',
  othersLabel: '',
  othersAmount: '',
  storeEnabled: false,
  storeItemName: '',
  storeItemAmount: '',
};

const Toast = ({ toast, onClose }) => {
  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-xs rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex h-2.5 w-2.5 flex-none rounded-full ${
            toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
          }`}
        />
        <div className="flex-1 text-sm text-slate-700">{toast.message}</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-slate-100 p-1 text-xs text-slate-500 transition hover:bg-slate-200"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

const Modal = ({ title, onClose, children, footer }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 px-4 py-8">
    <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
        >
          Close
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-6 py-4 text-sm text-slate-700">{children}</div>
      {footer && <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</div>}
    </div>
  </div>
);

const StudentFormFields = ({ formState, onChange, disabled }) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
      Student ID
      <input
        name="studentId"
        value={formState.studentId}
        onChange={onChange}
        required
        disabled={disabled}
        placeholder="STU-001"
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 disabled:cursor-not-allowed"
      />
    </label>
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
      Name
      <input
        name="name"
        value={formState.name}
        onChange={onChange}
        required
        placeholder="Student name"
        disabled={disabled}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 disabled:cursor-not-allowed"
      />
    </label>
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
      Class
      <select
        name="class"
        value={formState.class}
        onChange={onChange}
        required
        disabled={disabled}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 disabled:cursor-not-allowed"
      >
        <option value="">Select class</option>
        {CLASS_OPTIONS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
      Section
      <input
        name="section"
        value={formState.section}
        onChange={onChange}
        placeholder="A"
        disabled={disabled}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 disabled:cursor-not-allowed"
      />
    </label>
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
      Parent&apos;s Phone
      <input
        name="parent_phone"
        value={formState.parent_phone}
        onChange={onChange}
        placeholder="9876543210"
        disabled={disabled}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 disabled:cursor-not-allowed"
      />
    </label>
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
      Parent&apos;s Email
      <input
        type="email"
        name="parent_email"
        value={formState.parent_email}
        onChange={onChange}
        placeholder="parent@example.com"
        required
        disabled={disabled}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 disabled:cursor-not-allowed"
      />
    </label>
  </div>
);
const FeeRequestModal = ({
  context,
  feeStructure,
  defaultDueDate,
  onClose,
  onSubmit,
  submitting,
}) => {
  if (!context.open || !context.student) return null;

  const { student, form } = context;
  const structureForClass = feeStructure?.[student.class] || {};
  const tuitionFee = (() => {
    if (form.feeType === 'Custom') return 0;
    if (!structureForClass) return 0;
    switch (form.feeType) {
      case 'Monthly':
        return Number(structureForClass.monthly || 0);
      case 'Quarterly':
        return Number(structureForClass.quarterly || 0);
      case '6 Months':
        return Number(structureForClass.sixmonth || structureForClass['6month'] || 0);
      default:
        return 0;
    }
  })();

  const customFee = form.feeType === 'Custom' ? Number(form.customAmount || 0) : 0;
  const othersFee = Number(form.othersAmount || 0);
  const storeFee = form.storeEnabled ? Number(form.storeItemAmount || 0) : 0;
  const total = tuitionFee + customFee + othersFee + storeFee;

  return (
    <Modal title={`Create fee request · ${student.name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Fee Type
            <select
              name="feeType"
              value={form.feeType}
              onChange={(event) =>
                context.setForm((prev) => ({ ...prev, feeType: event.target.value }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            >
              {FEE_TYPE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-900">Summary</p>
            <p className="mt-1">Class: {student.class || '—'}</p>
            <p className="mt-1">Due date: {defaultDueDate || 'Not configured'}</p>
            <p className="mt-1 font-semibold text-slate-900">
              Total payable: ₹{Number(total || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {form.feeType === 'Custom' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Custom Fee Amount (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.customAmount}
                onChange={(event) =>
                  context.setForm((prev) => ({ ...prev, customAmount: event.target.value }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                required
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Custom Note
              <input
                value={form.customNote}
                onChange={(event) =>
                  context.setForm((prev) => ({ ...prev, customNote: event.target.value }))
                }
                placeholder="Ex: Annual lab charges"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              />
            </label>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Others Label (optional)
            <input
              value={form.othersLabel}
              onChange={(event) =>
                context.setForm((prev) => ({ ...prev, othersLabel: event.target.value }))
              }
              placeholder="Sports Day"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Others Amount (optional)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.othersAmount}
              onChange={(event) =>
                context.setForm((prev) => ({ ...prev, othersAmount: event.target.value }))
              }
              placeholder="0"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium text-slate-900">Store Charge</span>
            <button
              type="button"
              onClick={() =>
                context.setForm((prev) => ({ ...prev, storeEnabled: !prev.storeEnabled }))
              }
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                form.storeEnabled
                  ? 'border-cardinal bg-cardinal text-white'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              {form.storeEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          {form.storeEnabled && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Store Item Name
                <input
                  value={form.storeItemName}
                  onChange={(event) =>
                    context.setForm((prev) => ({ ...prev, storeItemName: event.target.value }))
                  }
                  placeholder="Uniform set"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Store Item Amount (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.storeItemAmount}
                  onChange={(event) =>
                    context.setForm((prev) => ({ ...prev, storeItemAmount: event.target.value }))
                  }
                  placeholder="0"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  required
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? 'Creating…' : 'Create request'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const HistoryModal = ({ context, onClose }) => {
  if (!context.open || !context.student) return null;

  return (
    <Modal title={`Payment history · ${context.student.name}`} onClose={onClose}>
      {context.loading ? (
        <p className="text-sm text-slate-600">Loading payments…</p>
      ) : context.entries.length === 0 ? (
        <p className="text-sm text-slate-600">No payments recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {context.entries.map((payment) => (
            <div key={payment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-base font-semibold text-slate-900">
                  ₹{Number(payment.amount || 0).toLocaleString('en-IN')}
                </p>
                <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase text-slate-500">
                  {payment.mode || 'Online'}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{payment.dateLabel}</p>
              {payment.transaction_id && (
                <p className="mt-1 text-xs text-slate-500">Txn ID: {payment.transaction_id}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

const DeleteConfirmModal = ({ context, onClose, onConfirm, loading }) => {
  if (!context.open || !context.student) return null;

  return (
    <Modal title="Delete student" onClose={onClose}>
      <p className="text-sm text-slate-600">
        Are you sure you want to delete {context.student.name}? This action cannot be undone and will remove all stored
        student details.
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="rounded-xl bg-red-500 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
};

const MarkPaidModal = ({ context, setContext, onConfirm, loading, onClose }) => {
  if (!context.open || !context.request) return null;

  const handleModeSelect = (mode) => {
    setContext((prev) => ({ ...prev, mode, step: mode === 'Cash' ? 'confirm' : 'transaction' }));
  };

  const handleBack = () => {
    setContext((prev) => ({ ...prev, mode: '', step: 'choice', transactionId: '' }));
  };

  const footerButtons = (
    <div className="flex justify-between">
      <button
        type="button"
        onClick={context.step === 'choice' ? onClose : handleBack}
        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
      >
        {context.step === 'choice' ? 'Close' : 'Back'}
      </button>
      {context.step !== 'choice' && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading || (context.mode === 'Online' && !context.transactionId)}
          className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? 'Saving…' : 'Confirm paid'}
        </button>
      )}
    </div>
  );

  return (
    <Modal title={`Mark paid · ${context.request.student_name || context.request.studentId}`} onClose={onClose} footer={footerButtons}>
      {context.step === 'choice' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Has the child paid via Cash or Online?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {['Cash', 'Online'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleModeSelect(option)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-cardinal hover:text-cardinal"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {context.step === 'confirm' && (
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            You are about to mark this fee request as paid via <span className="font-semibold">cash</span>. Please confirm
            that the payment has been collected.
          </p>
        </div>
      )}

      {context.step === 'transaction' && (
        <div className="space-y-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Enter Transaction ID
            <input
              value={context.transactionId}
              onChange={(event) =>
                setContext((prev) => ({ ...prev, transactionId: event.target.value }))
              }
              placeholder="PAY12345"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </label>
          <p className="text-xs text-slate-500">Please verify the transaction ID before confirming payment.</p>
        </div>
      )}
    </Modal>
  );
};
const AccountantDashboard = () => {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('students');
  const [students, setStudents] = useState([]);
  const [feeRequests, setFeeRequests] = useState([]);
  const [feeStructure, setFeeStructure] = useState({});
  const [dueDateSetting, setDueDateSetting] = useState('');
  const [addForm, setAddForm] = useState(emptyStudentForm);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [editContext, setEditContext] = useState({ open: false, studentId: '', form: emptyStudentForm, submitting: false });
  const [historyContext, setHistoryContext] = useState({ open: false, student: null, loading: false, entries: [] });
  const [deleteContext, setDeleteContext] = useState({ open: false, student: null, loading: false });
  const [feeRequestContext, setFeeRequestContext] = useState({
    open: false,
    student: null,
    form: defaultFeeRequestForm,
    setForm: () => {},
    submitting: false,
  });
  const [markPaidContext, setMarkPaidContext] = useState({
    open: false,
    request: null,
    step: 'choice',
    mode: '',
    transactionId: '',
    loading: false,
  });
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [toast, setToast] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionFilters, setTransactionFilters] = useState({ month: 'All', mode: 'All' });
  const [requestFilters, setRequestFilters] = useState({ status: 'All', class: 'All', search: '' });
  const [feeStructureDraft, setFeeStructureDraft] = useState(() => buildFeeStructureDraft({}));
  const [dueDateDraft, setDueDateDraft] = useState('');
  const [savingFeeStructure, setSavingFeeStructure] = useState(false);
  const toastTimerRef = useRef(null);
  const secondaryAuthRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setAuthChecked(true);
        router.replace('/');
        return;
      }

      const profileSnap = await getDoc(doc(db, 'users', currentUser.uid));
      if (!profileSnap.exists() || profileSnap.data().role !== 'accountant') {
        setAuthChecked(true);
        router.replace(profileSnap.data()?.role === 'parent' ? '/parent' : '/');
        return;
      }

      setUser(currentUser);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!secondaryAuthRef.current) {
      const parentApp = auth.app;
      const existing = getApps().find((app) => app.name === 'secondary');
      const secondaryApp = existing || initializeApp(parentApp.options, 'secondary');
      secondaryAuthRef.current = getFirebaseAuth(secondaryApp);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingStudents(true);
    const studentsQuery = query(collection(db, 'students'), orderBy('name', 'asc'));
    const unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setStudents(data);
      setLoadingStudents(false);
    });
    return () => unsubscribeStudents();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const requestsQuery = query(collection(db, 'fee_requests'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setFeeRequests(data);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const feeStructureRef = doc(db, 'settings', 'feestructure');
    const unsubscribeStructure = onSnapshot(feeStructureRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const { due_date, defaultDueDate, ...rest } = data;
        setFeeStructure(rest);
        setFeeStructureDraft(buildFeeStructureDraft(rest));
        const resolvedDueDate = due_date || defaultDueDate || '';
        setDueDateSetting(resolvedDueDate || '');
        setDueDateDraft(resolvedDueDate || '');
      }
      return students[0].id;
    });
  }, [students]);

    const generalSettingsRef = doc(db, 'settings', 'general');
    const unsubscribeGeneral = onSnapshot(generalSettingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const resolvedDueDate = data.defaultDueDate || '';
        setDueDateSetting((prev) => prev || resolvedDueDate);
        setDueDateDraft((prev) => prev || resolvedDueDate);
      }
    });

    return () => {
      unsubscribeStructure();
      unsubscribeGeneral();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setTransactionsLoading(true);
    const transactionsQuery = query(collection(db, 'transactions_log'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(
      transactionsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setTransactions(data);
        setTransactionsLoading(false);
      },
      (error) => {
        console.error('Error fetching transactions', error);
        setTransactions([]);
        setTransactionsLoading(false);
        triggerToast('Unable to load transactions.', 'error');
      },
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (students.length === 0) {
      setSelectedStudentId('');
      return;
    }
    setSelectedStudentId((current) => {
      if (current && students.some((student) => student.id === current)) {
        return current;
      }
      return students[0].id;
    });
  }, [students]);

  useEffect(() => {
    if (!toast) return;
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [toast]);

  const triggerToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const ensureParentAccount = async (email, details = {}) => {
    if (!email) return null;
    const trimmedEmail = email.trim().toLowerCase();
    const parentQuery = query(collection(db, 'users'), where('email', '==', trimmedEmail), limit(1));
    const existing = await getDocs(parentQuery);
    if (!existing.empty) {
      const existingId = existing.docs[0].id;
      const updates = { role: 'parent' };
      if (details.name) updates.name = details.name;
      if (details.phone) updates.contactNumber = details.phone;
      await setDoc(doc(db, 'users', existingId), updates, { merge: true });
      return existingId;
    }

    if (!secondaryAuthRef.current) {
      return null;
    }

    try {
      const defaultPassword = 'elnparent123';
      const parentAuth = secondaryAuthRef.current;
      const userCredential = await createUserWithEmailAndPassword(parentAuth, trimmedEmail, defaultPassword);
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: trimmedEmail,
        name: details.name || trimmedEmail.split('@')[0],
        role: 'parent',
        contactNumber: details.phone || '',
        created_at: serverTimestamp(),
      });
      return userCredential.user.uid;
    } catch (error) {
      if (error?.code === 'auth/email-already-in-use') {
        const existingAgain = await getDocs(parentQuery);
        if (!existingAgain.empty) {
          const existingId = existingAgain.docs[0].id;
          const updates = { role: 'parent' };
          if (details.name) updates.name = details.name;
          if (details.phone) updates.contactNumber = details.phone;
          await setDoc(doc(db, 'users', existingId), updates, { merge: true });
          return existingId;
        }
      }
      console.warn('Parent account creation skipped', error);
      return null;
    }
  };

  const handleAddFormChange = (event) => {
    const { name, value } = event.target;
    setAddForm((prev) => ({
      ...prev,
      [name]: name === 'parent_phone' ? value.replace(/[^0-9+]/g, '') : value,
    }));
  };

  const resetAddForm = () => {
    setAddForm(emptyStudentForm);
  };

  const handleAddStudent = async (event) => {
    event.preventDefault();
    setAddSubmitting(true);

    try {
      const studentId = addForm.studentId.trim();
      const name = addForm.name.trim();
      const className = addForm.class.trim();
      const parentEmail = addForm.parent_email.trim().toLowerCase();
      if (!studentId || !name || !className || !parentEmail) {
        triggerToast('All required fields must be filled.', 'error');
        setAddSubmitting(false);
        return;
      }

      const parentUid = await ensureParentAccount(parentEmail, {
        name: name ? `${name.split(' ')[0]}'s Parent` : parentEmail.split('@')[0],
        phone: addForm.parent_phone,
      });

      await addDoc(collection(db, 'students'), {
        studentId,
        name,
        class: className,
        section: addForm.section.trim(),
        parent_phone: addForm.parent_phone.trim(),
        parent_email: parentEmail,
        parent_uid: parentUid || '',
        parent_name: parentEmail.split('@')[0],
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      triggerToast('Student added successfully.');
      resetAddForm();
    } catch (error) {
      console.error('Error adding student', error);
      triggerToast('Unable to add student. Please try again.', 'error');
    } finally {
      setAddSubmitting(false);
    }
  };
  const openEditModal = (student) => {
    setEditContext({
      open: true,
      studentId: student.id,
      submitting: false,
      form: {
        studentId: student.studentId || '',
        name: student.name || '',
        class: student.class || '',
        section: student.section || '',
        parent_phone: student.parent_phone || '',
        parent_email: student.parent_email || '',
      },
    });
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditContext((prev) => ({
      ...prev,
      form: {
        ...prev.form,
        [name]: name === 'parent_phone' ? value.replace(/[^0-9+]/g, '') : value,
      },
    }));
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    setEditContext((prev) => ({ ...prev, submitting: true }));

    try {
      const studentRef = doc(db, 'students', editContext.studentId);
      const parentEmail = editContext.form.parent_email.trim().toLowerCase();
      const name = editContext.form.name.trim();
      const parentUid = await ensureParentAccount(parentEmail, {
        name: name ? `${name.split(' ')[0]}'s Parent` : parentEmail.split('@')[0],
        phone: editContext.form.parent_phone,
      });

      await updateDoc(studentRef, {
        studentId: editContext.form.studentId.trim(),
        name,
        class: editContext.form.class,
        section: editContext.form.section.trim(),
        parent_phone: editContext.form.parent_phone.trim(),
        parent_email: parentEmail,
        parent_uid: parentUid || '',
        parent_name: parentEmail.split('@')[0],
        updated_at: serverTimestamp(),
      });

      triggerToast('Student updated successfully.');
      setEditContext({ open: false, studentId: '', form: emptyStudentForm, submitting: false });
    } catch (error) {
      console.error('Error updating student', error);
      triggerToast('Unable to update student. Please try again.', 'error');
      setEditContext((prev) => ({ ...prev, submitting: false }));
    }
  };

  const openHistoryModal = async (student) => {
    setHistoryContext({ open: true, student, loading: true, entries: [] });
    try {
      const historyQuery = query(collection(db, 'transactions_log'), where('studentId', '==', student.studentId || student.id));
      const snapshot = await getDocs(historyQuery);
      const entries = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const dateValue = data.date?.toDate ? data.date.toDate() : new Date(data.date || Date.now());
        return {
          id: docSnap.id,
          ...data,
          dateLabel: Number.isFinite(dateValue.getTime()) ? dateValue.toLocaleString() : '—',
        };
      });
      entries.sort((a, b) => {
        const dateA = new Date(a.date || a.dateLabel || 0).getTime();
        const dateB = new Date(b.date || b.dateLabel || 0).getTime();
        return dateB - dateA;
      });
      setHistoryContext({ open: true, student, loading: false, entries });
    } catch (error) {
      console.error('Error fetching history', error);
      triggerToast('Unable to load payment history.', 'error');
      setHistoryContext({ open: true, student, loading: false, entries: [] });
    }
  };

  const openDeleteModal = (student) => {
    setDeleteContext({ open: true, student, loading: false });
  };

  const handleDeleteStudent = async () => {
    if (!deleteContext.student) return;
    setDeleteContext((prev) => ({ ...prev, loading: true }));
    try {
      await deleteDoc(doc(db, 'students', deleteContext.student.id));
      triggerToast('Student removed successfully.');
      setDeleteContext({ open: false, student: null, loading: false });
    } catch (error) {
      console.error('Error deleting student', error);
      triggerToast('Unable to delete student. Please try again.', 'error');
      setDeleteContext((prev) => ({ ...prev, loading: false }));
    }
  };

  const openFeeRequestModal = (student) => {
    setFeeRequestContext({
      open: true,
      student,
      form: defaultFeeRequestForm,
      setForm: (updater) =>
        setFeeRequestContext((prev) => ({
          ...prev,
          form: typeof updater === 'function' ? updater(prev.form) : updater,
        })),
      submitting: false,
    });
  };

  const handleCreateFeeRequest = async (event) => {
    event.preventDefault();
    if (!feeRequestContext.student) return;

    setFeeRequestContext((prev) => ({ ...prev, submitting: true }));

    const form = feeRequestContext.form;
    const student = feeRequestContext.student;
    const structureForClass = feeStructure?.[student.class] || {};
    let tuitionFee = 0;
    if (form.feeType === 'Monthly') tuitionFee = Number(structureForClass.monthly || 0);
    if (form.feeType === 'Quarterly') tuitionFee = Number(structureForClass.quarterly || 0);
    if (form.feeType === '6 Months') tuitionFee = Number(structureForClass.sixmonth || structureForClass['6month'] || 0);

    if (form.feeType !== 'Custom' && tuitionFee <= 0) {
      triggerToast('Tuition fee not configured for the selected class.', 'error');
      setFeeRequestContext((prev) => ({ ...prev, submitting: false }));
      return;
    }

    const customFee = form.feeType === 'Custom' ? Number(form.customAmount || 0) : 0;
    if (form.feeType === 'Custom' && customFee <= 0) {
      triggerToast('Custom amount must be greater than zero.', 'error');
      setFeeRequestContext((prev) => ({ ...prev, submitting: false }));
      return;
    }

    const othersFee = Number(form.othersAmount || 0);
    const storeFee = form.storeEnabled ? Number(form.storeItemAmount || 0) : 0;
    const total = tuitionFee + customFee + othersFee + storeFee;

    const breakdown = {
      tuition: tuitionFee,
      custom: form.feeType === 'Custom' ? { amount: customFee, note: form.customNote } : null,
      others: othersFee > 0 ? { amount: othersFee, label: form.othersLabel || 'Others' } : null,
      store: storeFee > 0 ? { amount: storeFee, label: form.storeItemName || 'Store Item' } : null,
    };

    try {
      await addDoc(collection(db, 'fee_requests'), {
        studentId: student.studentId || student.id,
        studentDocId: student.id,
        student_name: student.name,
        class: student.class,
        section: student.section || '',
        parent_email: student.parent_email || '',
        amount: total,
        fee_type: form.feeType,
        breakdown,
        status: 'Pending',
        due_date: dueDateSetting || '',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      triggerToast('Fee request created successfully.');
      setFeeRequestContext({
        open: false,
        student: null,
        form: defaultFeeRequestForm,
        setForm: () => {},
        submitting: false,
      });
    } catch (error) {
      console.error('Error creating fee request', error);
      triggerToast('Unable to create fee request. Please try again.', 'error');
      setFeeRequestContext((prev) => ({ ...prev, submitting: false }));
    }
  };

  const closeFeeRequestModal = () => {
    setFeeRequestContext({
      open: false,
      student: null,
      form: defaultFeeRequestForm,
      setForm: () => {},
      submitting: false,
    });
  };

  const handleRequestFilterChange = (event) => {
    const { name, value } = event.target;
    setRequestFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleTransactionFilterChange = (event) => {
    const { name, value } = event.target;
    setTransactionFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleFeeStructureDraftChange = (classKey, field, value) => {
    setFeeStructureDraft((prev) => ({
      ...prev,
      [classKey]: {
        ...prev[classKey],
        [field]: value.replace(/[^0-9.]/g, ''),
      },
    }));
  };

  const handleSaveFeeStructure = async (event) => {
    event.preventDefault();
    setSavingFeeStructure(true);
    try {
      const payload = { due_date: dueDateDraft || '' };
      Object.entries(feeStructureDraft).forEach(([classKey, values]) => {
        payload[classKey] = {
          monthly: Number(values.monthly || 0),
          quarterly: Number(values.quarterly || 0),
          sixmonth: Number(values.sixmonth || 0),
        };
      });
      await setDoc(doc(db, 'settings', 'feestructure'), payload, { merge: true });
      triggerToast('Fee configuration saved.');
      setDueDateSetting(dueDateDraft || '');
    } catch (error) {
      console.error('Error saving fee configuration', error);
      triggerToast('Unable to save fee configuration.', 'error');
    } finally {
      setSavingFeeStructure(false);
    }
  };

  const handleExportTransactions = () => {
    if (typeof window === 'undefined') return;
    if (filteredTransactions.length === 0) {
      triggerToast('No transactions available to export.', 'error');
      return;
    }
    const header = ['Date', 'Student', 'Class', 'Amount', 'Mode', 'Transaction ID', 'Month', 'Status'];
    const rows = filteredTransactions.map((entry) => {
      const date = resolveTransactionDate(entry);
      return [
        date ? date.toLocaleString() : '',
        entry.student_name || '',
        entry.class || '',
        Number(entry.amount || 0).toFixed(2),
        entry.mode || 'Online',
        entry.transaction_id || '',
        entry.month || resolveTransactionMonthLabel(entry) || '',
        entry.status || 'Paid',
      ];
    });
    const csvContent = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'transactions-report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const findStudentForRequest = (request) => {
    if (!request) return null;
    return (
      students.find((student) => student.id === request.studentDocId) ||
      students.find((student) => student.studentId === request.studentId)
    );
  };

  const openMarkPaidModal = (request) => {
    setMarkPaidContext({ open: true, request, step: 'choice', mode: '', transactionId: '', loading: false });
  };

  const closeMarkPaidModal = () => {
    setMarkPaidContext({
      open: false,
      request: null,
      step: 'choice',
      mode: '',
      transactionId: '',
      loading: false,
    });
  };

  const handleMarkPaid = async () => {
    if (!markPaidContext.request || !markPaidContext.mode) return;
    setMarkPaidContext((prev) => ({ ...prev, loading: true }));

    try {
      const requestRef = doc(db, 'fee_requests', markPaidContext.request.id);
      await updateDoc(requestRef, {
        status: 'Paid',
        paid_at: serverTimestamp(),
        payment_mode: markPaidContext.mode,
        transaction_id: markPaidContext.mode === 'Cash' ? 'manual' : markPaidContext.transactionId,
      });

      const now = new Date();
      await addDoc(collection(db, 'transactions_log'), {
        studentId: markPaidContext.request.studentId,
        student_name: markPaidContext.request.student_name,
        class: markPaidContext.request.class,
        amount: Number(markPaidContext.request.amount || 0),
        mode: markPaidContext.mode,
        transaction_id: markPaidContext.mode === 'Cash' ? 'manual' : markPaidContext.transactionId,
        status: 'Paid',
        date: now,
        month: now.toLocaleString('default', { month: 'long' }),
        created_at: serverTimestamp(),
      });

      triggerToast('Payment marked successfully.');
      closeMarkPaidModal();
    } catch (error) {
      console.error('Error marking payment', error);
      triggerToast('Unable to mark payment. Please try again.', 'error');
      setMarkPaidContext((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/');
  };
  const filteredRequests = useMemo(() => {
    const search = requestFilters.search.trim().toLowerCase();
    const filtered = feeRequests.filter((request) => {
      const matchesStatus = requestFilters.status === 'All' || request.status === requestFilters.status;
      const matchesClass = requestFilters.class === 'All' || request.class === requestFilters.class;
      const matchesSearch =
        search.length === 0 ||
        request.student_name?.toLowerCase().includes(search) ||
        request.studentId?.toLowerCase().includes(search);
      return matchesStatus && matchesClass && matchesSearch;
    });
    return filtered.sort((a, b) => {
      const dateA = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
      const dateB = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
      return dateB - dateA;
    });
  }, [feeRequests, requestFilters]);

  const transactionMonthOptions = useMemo(() => {
    const monthMap = new Map();
    transactions.forEach((entry) => {
      const key = resolveTransactionMonthKey(entry);
      if (!key || monthMap.has(key)) return;
      monthMap.set(key, resolveTransactionMonthLabel(entry) || key);
    });
    return Array.from(monthMap.entries()).map(([value, label]) => ({ value, label }));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((entry) => {
      const matchesMode =
        transactionFilters.mode === 'All' || (entry.mode || 'Online') === transactionFilters.mode;
      const matchesMonth =
        transactionFilters.month === 'All' || resolveTransactionMonthKey(entry) === transactionFilters.month;
      return matchesMode && matchesMonth;
    });
  }, [transactions, transactionFilters]);

  const filteredStudents = useMemo(() => {
    const search = searchValue.trim().toLowerCase();
    return students.filter((student) => {
      const matchesClass = classFilter === 'All' || student.class === classFilter;
      const matchesSearch =
        search.length === 0 ||
        student.name?.toLowerCase().includes(search) ||
        student.studentId?.toLowerCase().includes(search);
      return matchesClass && matchesSearch;
    });
  }, [students, searchValue, classFilter]);

  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null;
    return students.find((student) => student.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  const selectedStudentRequests = useMemo(() => {
    if (!selectedStudent) return [];
    const studentKey = selectedStudent.studentId || selectedStudent.id;
    return feeRequests
      .filter((request) => request.studentId === studentKey)
      .sort((a, b) => {
        const dateA = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
        const dateB = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
        return dateB - dateA;
      });
  }, [selectedStudent, feeRequests]);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Head>
          <title>Accountant Dashboard · EL-NODE Pay</title>
        </Head>
        <p className="text-sm font-medium text-slate-600">Loading dashboard…</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }
  return (
    <div className="min-h-screen bg-slate-50 font-poppins text-slate-800">
      <Head>
        <title>Accountant Dashboard · EL-NODE Pay</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <header className="border-b border-slate-200 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold text-cardinal">Accountant Dashboard</h1>
            <p className="text-sm text-slate-500">Manage students and tuition requests effortlessly.</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full border border-cardinal/30 px-4 py-2 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <nav className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
          {[
            { id: 'students', label: 'Students' },
            { id: 'requests', label: 'Fee Requests' },
            { id: 'add-student', label: 'Add Student' },
            { id: 'transactions', label: 'Transactions' },
            { id: 'settings', label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-cardinal text-white shadow'
                  : 'bg-transparent text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'add-student' && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Add a new student</h2>
            <p className="mt-1 text-sm text-slate-500">
              Capture student information and automatically onboard parents to EL-NODE Pay.
            </p>
            <form className="mt-6 space-y-6" onSubmit={handleAddStudent}>
              <StudentFormFields formState={addForm} onChange={handleAddFormChange} />
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={resetAddForm}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {addSubmitting ? 'Saving…' : 'Add student'}
                </button>
              </div>
            </form>
          </section>
        )}
        {activeTab === 'students' && (
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Students</h2>
                  <p className="text-sm text-slate-500">Search, filter, and manage student records.</p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <div className="flex w-full items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 focus-within:border-cardinal focus-within:ring-2 focus-within:ring-cardinal/20 sm:w-64">
                    <span className="mr-2 text-slate-400">🔍</span>
                    <input
                      type="search"
                      placeholder="Search by name or ID"
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      className="w-full bg-transparent text-sm focus:outline-none"
                    />
                  </div>
                  <select
                    value={classFilter}
                    onChange={(event) => setClassFilter(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 sm:w-auto"
                  >
                    <option value="All">All Classes</option>
                    {CLASS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loadingStudents ? (
                <div className="mt-8 flex justify-center">
                  <p className="text-sm text-slate-500">Loading students…</p>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="mt-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No students found. Add a new student to get started.
                </div>
              ) : (
                <>
                  <div className="mt-6 hidden overflow-x-auto md:block">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3 font-semibold">Student ID</th>
                          <th className="px-4 py-3 font-semibold">Name</th>
                          <th className="px-4 py-3 font-semibold">Class</th>
                          <th className="px-4 py-3 font-semibold">Section</th>
                          <th className="px-4 py-3 font-semibold">Parent Email</th>
                          <th className="px-4 py-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStudents.map((student) => (
                          <tr
                            key={student.id}
                            onClick={() => setSelectedStudentId(student.id)}
                            className={`cursor-pointer transition hover:bg-slate-50 ${
                              selectedStudentId === student.id ? 'bg-cardinal/5' : ''
                            }`}
                          >
                            <td className="px-4 py-3 font-medium text-slate-700">{student.studentId || '—'}</td>
                            <td className="px-4 py-3 text-slate-700">{student.name || '—'}</td>
                            <td className="px-4 py-3 text-slate-700">{student.class || '—'}</td>
                            <td className="px-4 py-3 text-slate-700">{student.section || '—'}</td>
                            <td className="px-4 py-3 text-slate-700">{student.parent_email || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openFeeRequestModal(student);
                                  }}
                                  className="rounded-full border border-cardinal/30 px-3 py-1 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
                                >
                                  Create Fee Request
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openHistoryModal(student);
                                  }}
                                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                                >
                                  View History
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openEditModal(student);
                                  }}
                                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openDeleteModal(student);
                                  }}
                                  className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 space-y-3 md:hidden">
                    {filteredStudents.map((student) => (
                      <div
                        key={student.id}
                        onClick={() => setSelectedStudentId(student.id)}
                        className={`rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition ${
                          selectedStudentId === student.id ? 'border-cardinal/40' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{student.name || '—'}</p>
                            <p className="text-xs text-slate-500">
                              {student.studentId || '—'} · Class {student.class || '—'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openFeeRequestModal(student);
                            }}
                            className="rounded-full border border-cardinal/30 px-3 py-1 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
                          >
                            Fee Request
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openHistoryModal(student);
                            }}
                            className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                          >
                            History
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditModal(student);
                            }}
                            className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDeleteModal(student);
                            }}
                            className="rounded-full border border-red-200 px-3 py-1 text-red-500 transition hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">{student.parent_email || '—'}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            {selectedStudent && (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{selectedStudent.name || '—'}</h3>
                    <p className="text-sm text-slate-500">
                      ID: {selectedStudent.studentId || '—'} · Class {selectedStudent.class || '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openFeeRequestModal(selectedStudent)}
                    className="rounded-full border border-cardinal/30 px-4 py-2 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10"
                  >
                    Create Fee Request
                  </button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Contact</p>
                    <p className="mt-2">Parent email: {selectedStudent.parent_email || '—'}</p>
                    <p className="mt-1">Parent phone: {selectedStudent.parent_phone || '—'}</p>
                    <p className="mt-1">Section: {selectedStudent.section || '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Fee requests</p>
                    <p className="mt-2">Pending: {selectedStudentRequests.filter((item) => item.status === 'Pending').length}</p>
                    <p className="mt-1">Paid: {selectedStudentRequests.filter((item) => item.status === 'Paid').length}</p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {selectedStudentRequests.length === 0 ? (
                    <p className="text-sm text-slate-500">No fee requests generated yet.</p>
                  ) : (
                    selectedStudentRequests.map((request) => {
                      const createdAt = request.created_at?.toDate ? request.created_at.toDate() : null;
                      const extras = [];
                      if (request.breakdown?.others) {
                        extras.push({
                          label: request.breakdown.others.label || 'Others',
                          amount: request.breakdown.others.amount || 0,
                        });
                      }
                      if (request.breakdown?.store) {
                        extras.push({
                          label: request.breakdown.store.label || 'Store Item',
                          amount: request.breakdown.store.amount || 0,
                        });
                      }
                      return (
                        <div
                          key={request.id}
                          className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-base font-semibold text-slate-900">
                                ₹{Number(request.amount || 0).toLocaleString('en-IN')}
                              </p>
                              <p className="text-xs text-slate-500">
                                {request.fee_type || 'Tuition'} · {createdAt ? createdAt.toLocaleString() : '—'}
                              </p>
                              {request.due_date && (
                                <p className="text-xs text-slate-500">Due: {request.due_date}</p>
                              )}
                            </div>
                            <span
                              className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                request.status === 'Paid'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                  : 'border-amber-200 bg-amber-50 text-amber-600'
                              }`}
                            >
                              {request.status}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold uppercase text-slate-500">Breakdown</p>
                              <ul className="mt-2 space-y-1 text-xs">
                                {Number(request.breakdown?.tuition || 0) > 0 && (
                                  <li className="flex justify-between">
                                    <span>Tuition ({request.fee_type})</span>
                                    <span>₹{Number(request.breakdown.tuition || 0).toLocaleString('en-IN')}</span>
                                  </li>
                                )}
                                {request.breakdown?.custom && (
                                  <li className="flex justify-between">
                                    <span>{request.breakdown.custom.note || 'Custom fee'}</span>
                                    <span>₹{Number(request.breakdown.custom.amount || 0).toLocaleString('en-IN')}</span>
                                  </li>
                                )}
                                {extras.map((extra) => (
                                  <li key={`${request.id}-${extra.label}`} className="flex justify-between">
                                    <span>{extra.label}</span>
                                    <span>₹{Number(extra.amount || 0).toLocaleString('en-IN')}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="flex items-end justify-end">
                              {request.status !== 'Paid' && (
                                <button
                                  type="button"
                                  onClick={() => openMarkPaidModal(request)}
                                  className="rounded-full border border-cardinal/30 px-4 py-2 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
                                >
                                  Mark Paid
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </section>
        )}
        {activeTab === 'requests' && (
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Fee Requests</h2>
                  <p className="text-sm text-slate-500">Track pending and paid fee requests for every student.</p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <div className="flex w-full items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 focus-within:border-cardinal focus-within:ring-2 focus-within:ring-cardinal/20 sm:w-64">
                    <span className="mr-2 text-slate-400">🔍</span>
                    <input
                      type="search"
                      name="search"
                      placeholder="Search by student or ID"
                      value={requestFilters.search}
                      onChange={handleRequestFilterChange}
                      className="w-full bg-transparent text-sm focus:outline-none"
                    />
                  </div>
                  <select
                    name="status"
                    value={requestFilters.status}
                    onChange={handleRequestFilterChange}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 sm:w-auto"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Paid">Paid</option>
                  </select>
                  <select
                    name="class"
                    value={requestFilters.class}
                    onChange={handleRequestFilterChange}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 sm:w-auto"
                  >
                    <option value="All">All Classes</option>
                    {CLASS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="mt-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No fee requests found yet.
                </div>
              ) : (
                <>
                  <div className="mt-6 hidden overflow-x-auto md:block">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3 font-semibold">Student</th>
                          <th className="px-4 py-3 font-semibold">Class</th>
                          <th className="px-4 py-3 font-semibold">Fee Type</th>
                          <th className="px-4 py-3 font-semibold">Amount</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Created</th>
                          <th className="px-4 py-3 font-semibold">Due</th>
                          <th className="px-4 py-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredRequests.map((request) => {
                          const createdAt = request.created_at?.toDate ? request.created_at.toDate() : null;
                          const extras = [];
                          if (request.breakdown?.others) {
                            extras.push({
                              label: request.breakdown.others.label || 'Others',
                              amount: request.breakdown.others.amount || 0,
                            });
                          }
                          if (request.breakdown?.store) {
                            extras.push({
                              label: request.breakdown.store.label || 'Store Item',
                              amount: request.breakdown.store.amount || 0,
                            });
                          }
                          const studentForRow = findStudentForRequest(request);
                          return (
                            <tr key={request.id} className="transition hover:bg-slate-50/80">
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-slate-900">{request.student_name || '—'}</span>
                                  <span className="text-xs text-slate-500">ID: {request.studentId || '—'}</span>
                                  {extras.length > 0 && (
                                    <div className="mt-2 text-xs text-slate-500">
                                      <p className="font-semibold text-slate-600">Extras</p>
                                      <ul className="mt-1 space-y-1">
                                        {extras.map((extra) => (
                                          <li key={`${request.id}-${extra.label}`} className="flex justify-between">
                                            <span>{extra.label}</span>
                                            <span>{formatCurrency(extra.amount)}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-700">{request.class || '—'}</td>
                              <td className="px-4 py-3 text-slate-700">{request.fee_type || '—'}</td>
                              <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(request.amount || 0)}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                    request.status === 'Paid'
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                      : 'border-amber-200 bg-amber-50 text-amber-600'
                                  }`}
                                >
                                  {request.status || 'Pending'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-500">{createdAt ? createdAt.toLocaleDateString() : '—'}</td>
                              <td className="px-4 py-3 text-slate-500">{request.due_date || dueDateSetting || '—'}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold">
                                  {request.status !== 'Paid' && (
                                    <button
                                      type="button"
                                      onClick={() => openMarkPaidModal(request)}
                                      className="rounded-full border border-cardinal/30 px-3 py-1 text-cardinal transition hover:bg-cardinal/10"
                                    >
                                      Mark Paid
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const studentRecord = studentForRow;
                                      if (studentRecord) {
                                        openHistoryModal(studentRecord);
                                      } else {
                                        triggerToast('Student record not found for this request.', 'error');
                                      }
                                    }}
                                    className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                                  >
                                    View History
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 space-y-3 md:hidden">
                    {filteredRequests.map((request) => {
                      const createdAt = request.created_at?.toDate ? request.created_at.toDate() : null;
                      const extras = [];
                      if (request.breakdown?.others) {
                        extras.push({
                          label: request.breakdown.others.label || 'Others',
                          amount: request.breakdown.others.amount || 0,
                        });
                      }
                      if (request.breakdown?.store) {
                        extras.push({
                          label: request.breakdown.store.label || 'Store Item',
                          amount: request.breakdown.store.amount || 0,
                        });
                      }
                      const studentForRow = findStudentForRequest(request);
                      return (
                        <div key={request.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-1">
                            <p className="text-sm font-semibold text-slate-900">{request.student_name || '—'}</p>
                            <p className="text-xs text-slate-500">
                              ID: {request.studentId || '—'} · Class {request.class || '—'}
                            </p>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full border border-slate-200 px-2 py-1">{request.fee_type || '—'}</span>
                            <span className="rounded-full border border-slate-200 px-2 py-1 font-semibold text-slate-700">
                              {formatCurrency(request.amount || 0)}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-1 font-semibold ${
                                request.status === 'Paid'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                  : 'border-amber-200 bg-amber-50 text-amber-600'
                              }`}
                            >
                              {request.status || 'Pending'}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            Created: {createdAt ? createdAt.toLocaleDateString() : '—'} · Due: {request.due_date || dueDateSetting || '—'}
                          </p>
                          {extras.length > 0 && (
                            <div className="mt-3 text-xs text-slate-600">
                              <p className="font-semibold uppercase text-slate-500">Extras</p>
                              <ul className="mt-1 space-y-1">
                                {extras.map((extra) => (
                                  <li key={`${request.id}-mobile-${extra.label}`} className="flex justify-between">
                                    <span>{extra.label}</span>
                                    <span>{formatCurrency(extra.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                            {request.status !== 'Paid' && (
                              <button
                                type="button"
                                onClick={() => openMarkPaidModal(request)}
                                className="rounded-full border border-cardinal/30 px-3 py-1 text-cardinal transition hover:bg-cardinal/10"
                              >
                                Mark Paid
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (studentForRow) {
                                  openHistoryModal(studentForRow);
                                } else {
                                  triggerToast('Student record not found for this request.', 'error');
                                }
                              }}
                              className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                            >
                              View History
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
        {activeTab === 'transactions' && (
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Transactions Log</h2>
                  <p className="text-sm text-slate-500">Central ledger of all online and manual fee collections.</p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <select
                    name="month"
                    value={transactionFilters.month}
                    onChange={handleTransactionFilterChange}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 sm:w-auto"
                  >
                    <option value="All">All Months</option>
                    {transactionMonthOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    name="mode"
                    value={transactionFilters.mode}
                    onChange={handleTransactionFilterChange}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20 sm:w-auto"
                  >
                    <option value="All">All Modes</option>
                    <option value="Cash">Cash</option>
                    <option value="Online">Online</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleExportTransactions}
                    className="w-full rounded-xl border border-cardinal px-4 py-2 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10 sm:w-auto"
                  >
                    Export to Excel
                  </button>
                </div>
              </div>
              {transactionsLoading ? (
                <div className="mt-8 flex justify-center">
                  <p className="text-sm text-slate-500">Loading transactions…</p>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="mt-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No transactions recorded for the selected filters.
                </div>
              ) : (
                <>
                  <div className="mt-6 hidden overflow-x-auto md:block">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">Student</th>
                          <th className="px-4 py-3 font-semibold">Class</th>
                          <th className="px-4 py-3 font-semibold">Amount</th>
                          <th className="px-4 py-3 font-semibold">Mode</th>
                          <th className="px-4 py-3 font-semibold">Transaction ID</th>
                          <th className="px-4 py-3 font-semibold">Month</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTransactions.map((entry) => {
                          const dateValue = resolveTransactionDate(entry);
                          return (
                            <tr key={entry.id} className="transition hover:bg-slate-50/80">
                              <td className="px-4 py-3 text-slate-700">{dateValue ? dateValue.toLocaleString() : '—'}</td>
                              <td className="px-4 py-3 text-slate-700">{entry.student_name || '—'}</td>
                              <td className="px-4 py-3 text-slate-700">{entry.class || '—'}</td>
                              <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(entry.amount || 0)}</td>
                              <td className="px-4 py-3 text-slate-700">{entry.mode || 'Online'}</td>
                              <td className="px-4 py-3 text-slate-700">{entry.transaction_id || '—'}</td>
                              <td className="px-4 py-3 text-slate-700">{entry.month || resolveTransactionMonthLabel(entry) || '—'}</td>
                              <td className="px-4 py-3 text-slate-700">{entry.status || 'Paid'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 space-y-3 md:hidden">
                    {filteredTransactions.map((entry) => {
                      const dateValue = resolveTransactionDate(entry);
                      return (
                        <div key={entry.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="text-sm font-semibold text-slate-900">{entry.student_name || '—'}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.studentId || ''} · Class {entry.class || '—'}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">{dateValue ? dateValue.toLocaleString() : '—'}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full border border-slate-200 px-2 py-1">{entry.mode || 'Online'}</span>
                            <span className="rounded-full border border-slate-200 px-2 py-1 font-semibold text-slate-700">
                              {formatCurrency(entry.amount || 0)}
                            </span>
                            <span className="rounded-full border border-slate-200 px-2 py-1">{entry.status || 'Paid'}</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            Txn ID: {entry.transaction_id || '—'} · {entry.month || resolveTransactionMonthLabel(entry) || '—'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
        {activeTab === 'settings' && (
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Fee configuration</h2>
              <p className="mt-1 text-sm text-slate-500">
                Update tuition fees for each class and the default due date used when generating requests.
              </p>
              <form className="mt-6 space-y-6" onSubmit={handleSaveFeeStructure}>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Default Due Date
                  <input
                    value={dueDateDraft}
                    onChange={(event) => setDueDateDraft(event.target.value)}
                    placeholder="Ex: 10th of every month"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  />
                </label>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Class</th>
                        <th className="px-4 py-3 font-semibold">Monthly</th>
                        <th className="px-4 py-3 font-semibold">Quarterly</th>
                        <th className="px-4 py-3 font-semibold">6 Months</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {CLASS_OPTIONS.map((classKey) => {
                        const values = feeStructureDraft[classKey] || {};
                        return (
                          <tr key={classKey}>
                            <td className="px-4 py-3 font-semibold text-slate-700">{classKey}</td>
                            <td className="px-4 py-3">
                              <input
                                value={values.monthly ?? ''}
                                onChange={(event) => handleFeeStructureDraftChange(classKey, 'monthly', event.target.value)}
                                placeholder="0"
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                value={values.quarterly ?? ''}
                                onChange={(event) => handleFeeStructureDraftChange(classKey, 'quarterly', event.target.value)}
                                placeholder="0"
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                value={values.sixmonth ?? ''}
                                onChange={(event) => handleFeeStructureDraftChange(classKey, 'sixmonth', event.target.value)}
                                placeholder="0"
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFeeStructureDraft(buildFeeStructureDraft(feeStructure));
                      setDueDateDraft(dueDateSetting || '');
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    disabled={savingFeeStructure}
                    className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {savingFeeStructure ? 'Saving…' : 'Save configuration'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
      <HistoryModal context={historyContext} onClose={() => setHistoryContext({ open: false, student: null, loading: false, entries: [] })} />
      <DeleteConfirmModal
        context={deleteContext}
        onClose={() => setDeleteContext({ open: false, student: null, loading: false })}
        onConfirm={handleDeleteStudent}
        loading={deleteContext.loading}
      />
      <MarkPaidModal
        context={markPaidContext}
        setContext={setMarkPaidContext}
        onConfirm={handleMarkPaid}
        loading={markPaidContext.loading}
        onClose={closeMarkPaidModal}
      />
      {editContext.open && (
        <Modal title="Edit student" onClose={() => setEditContext({ open: false, studentId: '', form: emptyStudentForm, submitting: false })}>
          <form className="space-y-6" onSubmit={handleEditSubmit}>
            <StudentFormFields formState={editContext.form} onChange={handleEditChange} />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditContext({ open: false, studentId: '', form: emptyStudentForm, submitting: false })}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editContext.submitting}
                className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {editContext.submitting ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      <FeeRequestModal
        context={feeRequestContext}
        feeStructure={feeStructure}
        defaultDueDate={dueDateSetting}
        onClose={closeFeeRequestModal}
        onSubmit={handleCreateFeeRequest}
        submitting={feeRequestContext.submitting}
      />
    </div>
  );
};

export default AccountantDashboard;
