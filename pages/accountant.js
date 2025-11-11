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
  arrayUnion,
  collection,
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
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { auth, db } from '../lib/firebase';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title);

const CLASS_OPTIONS = ['Nursery', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const SESSION_OPTIONS = ['2023-24', '2024-25', '2025-26', '2026-27', '2027-28'];
const FEE_CYCLE_OPTIONS = ['Monthly', 'Quarterly', 'Half-Yearly'];
const STATUS_OPTIONS = ['All', 'Paid', 'Pending', 'Overdue'];

const emptyStudentForm = {
  studentId: '',
  name: '',
  class: '',
  section: '',
  parent_phone: '',
  parent_email: '',
  fee_cycle: 'Monthly',
};

const statusBadgeClasses = {
  Paid: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  Pending: 'bg-amber-100 text-amber-700 border border-amber-200',
  Overdue: 'bg-rose-100 text-rose-700 border border-rose-200',
};

const Modal = ({ title, children, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
        >
          Close
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-6 py-4">{children}</div>
    </div>
  </div>
);

const StudentFormModal = ({
  isEditing,
  formState,
  onChange,
  onSubmit,
  onClose,
  isSubmitting,
  calculatedFee,
  defaultDueDate,
}) => (
  <Modal title={isEditing ? 'Edit Student' : 'Add Student'} onClose={onClose}>
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Student ID
          <input
            name="studentId"
            value={formState.studentId}
            onChange={onChange}
            required
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="STU-001"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Name
          <input
            name="name"
            value={formState.name}
            onChange={onChange}
            required
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="Student name"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Class
          <select
            name="class"
            value={formState.class}
            onChange={onChange}
            required
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
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
          Section (optional)
          <input
            name="section"
            value={formState.section}
            onChange={onChange}
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="A"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Parent Phone
          <input
            name="parent_phone"
            value={formState.parent_phone}
            onChange={onChange}
            placeholder="9876543210"
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Parent Email
          <input
            type="email"
            name="parent_email"
            value={formState.parent_email}
            onChange={onChange}
            required
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="parent@example.com"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Fee Cycle
          <select
            name="fee_cycle"
            value={formState.fee_cycle}
            onChange={onChange}
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            {FEE_CYCLE_OPTIONS.map((cycle) => (
              <option key={cycle} value={cycle}>
                {cycle}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Summary</p>
        <p className="mt-1">Fee cycle: {formState.fee_cycle}</p>
        <p className="mt-1">Due date: {defaultDueDate || 'Not configured'}</p>
        <p className="mt-1 font-semibold text-slate-900">
          Tuition fee payable: ₹{Number(calculatedFee || 0).toLocaleString('en-IN')}
        </p>
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Add student'}
        </button>
      </div>
    </form>
  </Modal>
);

const PaymentHistoryModal = ({ student, payments, onClose }) => (
  <Modal title={`Payment history · ${student?.name || ''}`} onClose={onClose}>
    <div className="space-y-3 text-sm">
      {payments.length === 0 && <p className="text-slate-600">No payments recorded yet.</p>}
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-semibold text-slate-900">₹{payment.amount?.toLocaleString('en-IN')}</div>
            <span className="text-xs uppercase tracking-wide text-slate-500">{payment.mode || 'Online'}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{payment.fee_type || 'Tuition'}</span>
            {payment.term && <span className="rounded-full bg-white px-2 py-0.5">{payment.term}</span>}
            <span>
              {payment.date?.toDate
                ? payment.date.toDate().toLocaleString()
                : new Date(payment.date).toLocaleString()}
            </span>
          </div>
          {Array.isArray(payment.breakdown) && payment.breakdown.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {payment.breakdown.map((item, idx) => (
                <li key={`${payment.id}-fee-${idx}`} className="flex justify-between">
                  <span>{item.label}</span>
                  <span>₹{Number(item.amount || 0).toLocaleString('en-IN')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  </Modal>
);

const SettingsPanel = ({ settingsState, onChange, onSave, isSaving }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <h3 className="text-lg font-semibold text-slate-900">Settings</h3>
    <p className="mt-1 text-sm text-slate-600">
      Configure academic term details, default due dates, and reminder templates for automated workflows.
    </p>
    <form className="mt-6 space-y-4" onSubmit={onSave}>
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Current Academic Term
        <input
          name="currentTerm"
          value={settingsState.currentTerm}
          onChange={onChange}
          placeholder="2024-2025 Term 1"
          className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Default Due Date
        <input
          type="date"
          name="defaultDueDate"
          value={settingsState.defaultDueDate}
          onChange={onChange}
          className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Reminder Message Template
        <textarea
          name="reminderTemplate"
          value={settingsState.reminderTemplate}
          onChange={onChange}
          rows={4}
          className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          placeholder="Dear Parent, your fee payment is due on {{due_date}}. Kindly clear the dues at the earliest."
        />
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  </div>
);

const AccountantDashboard = () => {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [loadingReminders, setLoadingReminders] = useState(true);
  const [formState, setFormState] = useState(emptyStudentForm);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [filters, setFilters] = useState({
    class: 'All',
    status: 'All',
    term: 'All',
    search: '',
  });
  const [historyContext, setHistoryContext] = useState({ open: false, student: null, entries: [] });
  const [settingsState, setSettingsState] = useState({
    currentTerm: '',
    defaultDueDate: '',
    reminderTemplate: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [feeStructure, setFeeStructure] = useState({ session: '', defaultDueDate: '', fees: {} });
  const [feeStructureDraft, setFeeStructureDraft] = useState({ session: '', defaultDueDate: '', fees: {} });
  const [feeStructureSaving, setFeeStructureSaving] = useState(false);
  const [storeCharges, setStoreCharges] = useState([]);
  const [storeChargeForm, setStoreChargeForm] = useState({
    studentId: '',
    itemName: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
  });
  const [storeChargeSubmitting, setStoreChargeSubmitting] = useState(false);
  const [transactionsLog, setTransactionsLog] = useState([]);
  const [transactionFilters, setTransactionFilters] = useState({ month: 'All', mode: 'All' });
  const [toast, setToast] = useState(null);
  const secondaryAuthRef = useRef(null);
  const toastTimerRef = useRef(null);

  const normaliseFeeStructure = (data) => {
    const rawFees = data?.fees || {};
    const formattedFees = {};
    CLASS_OPTIONS.forEach((cls) => {
      const entry = rawFees[cls] || {};
      formattedFees[cls] = {
        monthly: entry.monthly ?? '',
        quarterly: entry.quarterly ?? '',
        halfYearly: entry.halfYearly ?? '',
      };
    });
    return {
      session: data?.session || '',
      defaultDueDate: data?.defaultDueDate || '',
      fees: formattedFees,
    };
  };

  const getFeeAmountFromStructure = (className, cycle) => {
    if (!className) return 0;
    const entry = feeStructureDraft.fees?.[className] || {};
    const monthly = Number(entry.monthly || 0);
    const quarterly = Number(entry.quarterly || 0);
    const halfYearly = Number(entry.halfYearly || 0);
    switch (cycle) {
      case 'Monthly':
        return monthly;
      case 'Quarterly':
        return quarterly;
      case 'Half-Yearly':
        if (halfYearly) return halfYearly;
        if (quarterly) return quarterly * 2;
        return monthly * 6;
      default:
        return 0;
    }
  };

  const getMonthMeta = (dateInput) => {
    let dateValue;
    if (!dateInput) {
      dateValue = new Date();
    } else if (dateInput?.toDate) {
      dateValue = dateInput.toDate();
    } else if (dateInput instanceof Date) {
      dateValue = dateInput;
    } else {
      dateValue = new Date(dateInput);
    }
    if (!Number.isFinite(dateValue.getTime())) {
      dateValue = new Date();
    }
    const key = `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}`;
    const label = dateValue.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    return { key, label, date: dateValue };
  };

  const parseMonthKey = (value) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
    }
    const parts = `${value}`.split(' ');
    if (parts.length >= 2) {
      const tryDate = new Date(`${parts[0]} 1, ${parts[1]}`);
      if (Number.isFinite(tryDate.getTime())) {
        return `${tryDate.getFullYear()}-${String(tryDate.getMonth() + 1).padStart(2, '0')}`;
      }
    }
    return value;
  };

  const resolveTransactionMonthKey = (entry) => {
    if (!entry) return '';
    if (entry.month_key) return entry.month_key;
    if (entry.month) return parseMonthKey(entry.month);
    return getMonthMeta(entry.date).key;
  };

  const resolveTransactionMonthLabel = (entry) => {
    if (!entry) return '';
    if (entry.month_label) return entry.month_label;
    if (entry.month) {
      const parsed = new Date(entry.month);
      if (Number.isFinite(parsed.getTime())) {
        return parsed.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      }
      return entry.month;
    }
    return getMonthMeta(entry.date).label;
  };

  const logTransactionEntry = async ({ student, amount, mode, transactionId, status }) => {
    if (!student) return;
    const meta = getMonthMeta();
    try {
      await addDoc(collection(db, 'transactions_log'), {
        student_doc_id: student.id,
        studentId: student.studentId || student.id,
        student_name: student.name,
        class: student.class,
        amount: Number(amount || 0),
        mode: mode || 'Online',
        transaction_id: transactionId || '',
        status: status || 'Success',
        month_key: meta.key,
        month_label: meta.label,
        date: serverTimestamp(),
        created_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Unable to record transaction log', error);
    }
  };

  const triggerToast = (message, tone = 'success') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

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

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const studentQuery = collection(db, 'students');
    const unsubscribeStudents = onSnapshot(
      studentQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setStudents(data);
        setLoadingStudents(false);
      },
      () => setLoadingStudents(false),
    );

    const paymentQuery = query(collection(db, 'payments'), orderBy('date', 'desc'), limit(250));
    const unsubscribePayments = onSnapshot(
      paymentQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setPayments(data);
        setLoadingPayments(false);
      },
      () => setLoadingPayments(false),
    );

    const remindersQuery = query(collection(db, 'reminders'), orderBy('created_at', 'desc'), limit(100));
    const unsubscribeReminders = onSnapshot(
      remindersQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setReminders(data);
        setLoadingReminders(false);
      },
      () => setLoadingReminders(false),
    );

    const settingsRef = doc(db, 'settings', 'general');
    const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettingsState({
          currentTerm: data.currentTerm || '',
          defaultDueDate: data.defaultDueDate || '',
          reminderTemplate:
            data.reminderTemplate || 'Dear Parent, your fee payment is due on {{due_date}}. Kindly clear the dues.',
        });
      }
    });

    const feeStructureRef = doc(db, 'settings', 'feestructure');
    const unsubscribeFeeStructure = onSnapshot(feeStructureRef, (snapshot) => {
      const structure = snapshot.exists()
        ? normaliseFeeStructure(snapshot.data())
        : normaliseFeeStructure({});
      setFeeStructure(structure);
      setFeeStructureDraft(structure);
    });

    const storeChargesQuery = query(collection(db, 'store_charges'), orderBy('created_at', 'desc'));
    const unsubscribeStoreCharges = onSnapshot(storeChargesQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setStoreCharges(data);
    });

    const transactionsQuery = query(collection(db, 'transactions_log'), orderBy('date', 'desc'));
    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setTransactionsLog(data);
    });

    return () => {
      unsubscribeStudents();
      unsubscribePayments();
      unsubscribeReminders();
      unsubscribeSettings();
      unsubscribeFeeStructure();
      unsubscribeStoreCharges();
      unsubscribeTransactions();
    };
  }, [user]);

  useEffect(() => {
    if (!secondaryAuthRef.current) {
      const parentApp = auth.app;
      const existing = getApps().find((app) => app.name === 'secondary');
      const secondaryApp = existing || initializeApp(parentApp.options, 'secondary');
      secondaryAuthRef.current = getFirebaseAuth(secondaryApp);
    }
  }, []);

  const monthMetrics = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let monthTotal = 0;
    let yearTotal = 0;

    payments.forEach((payment) => {
      const date = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
      if (!Number.isFinite(date.getTime())) return;
      if (date >= startOfYear) {
        yearTotal += Number(payment.amount || 0);
      }
      if (date >= startOfMonth) {
        monthTotal += Number(payment.amount || 0);
      }
    });

    const pendingTotal = students
      .filter((student) => student.status !== 'Paid')
      .reduce((sum, student) => sum + Number(student.balance ?? student.fee_amount ?? 0), 0);

    const overdueCount = students.filter((student) => student.status === 'Overdue').length;

    const upcomingCount = students.filter((student) => {
      if (!student.due_date) return false;
      const due = new Date(student.due_date);
      if (!Number.isFinite(due.getTime())) return false;
      const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }).length;

    const paidCount = students.filter((student) => student.status === 'Paid').length;
    const unpaidCount = students.length - paidCount;

    const outstandingList = [...students]
      .map((student) => ({
        id: student.id,
        name: student.name,
        class: student.class,
        balance: Number(student.balance ?? student.fee_amount ?? 0),
        status: student.status,
      }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);

    const revenueByCategory = payments.reduce((acc, payment) => {
      const key = payment.fee_type || 'Tuition';
      acc[key] = (acc[key] || 0) + Number(payment.amount || 0);
      return acc;
    }, {});

    const monthLabels = [];
    const monthValues = [];

    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = date.toLocaleString('en-IN', { month: 'short' });
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      const sum = payments.reduce((total, payment) => {
        const paymentDate = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
        if (!Number.isFinite(paymentDate.getTime())) return total;
        if (paymentDate >= monthStart && paymentDate <= monthEnd) {
          return total + Number(payment.amount || 0);
        }
        return total;
      }, 0);
      monthLabels.push(label);
      monthValues.push(sum);
    }

    return {
      monthTotal,
      yearTotal,
      pendingTotal,
      overdueCount,
      upcomingCount,
      paidCount,
      unpaidCount,
      outstandingList,
      revenueByCategory,
      monthLabels,
      monthValues,
    };
  }, [payments, students]);

  const calculatedFeeAmount = useMemo(
    () => getFeeAmountFromStructure(formState.class, formState.fee_cycle),
    [formState.class, formState.fee_cycle, feeStructureDraft],
  );

  const sessionOptions = useMemo(() => {
    if (!feeStructureDraft.session || SESSION_OPTIONS.includes(feeStructureDraft.session)) {
      return SESSION_OPTIONS;
    }
    return [...SESSION_OPTIONS, feeStructureDraft.session];
  }, [feeStructureDraft.session]);

  const transactionMonthOptions = useMemo(() => {
    const monthMap = new Map();
    transactionsLog.forEach((entry) => {
      const key = resolveTransactionMonthKey(entry);
      const label = resolveTransactionMonthLabel(entry);
      if (key) {
        monthMap.set(key, label || key);
      }
    });
    return Array.from(monthMap.entries())
      .sort((a, b) => (a[0] > b[0] ? -1 : 1))
      .map(([value, label]) => ({ value, label }));
  }, [transactionsLog]);

  const filteredTransactions = useMemo(() => {
    return transactionsLog.filter((entry) => {
      const matchesMode =
        transactionFilters.mode === 'All' || (entry.mode || 'Online') === transactionFilters.mode;
      if (transactionFilters.month === 'All') {
        return matchesMode;
      }
      const key = resolveTransactionMonthKey(entry);
      return matchesMode && key === transactionFilters.month;
    });
  }, [transactionsLog, transactionFilters]);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const matchesClass = filters.class === 'All' || student.class === filters.class;
      const matchesStatus = filters.status === 'All' || student.status === filters.status;
      const matchesTerm = filters.term === 'All' || (student.term || '').toLowerCase().includes(filters.term.toLowerCase());
      const searchValue = filters.search.trim().toLowerCase();
      const matchesSearch =
        searchValue.length === 0 ||
        student.name?.toLowerCase().includes(searchValue) ||
        student.studentId?.toLowerCase().includes(searchValue);
      return matchesClass && matchesStatus && matchesTerm && matchesSearch;
    });
  }, [students, filters]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenAddStudent = () => {
    setFormState({ ...emptyStudentForm, fee_cycle: 'Monthly' });
    setEditingStudentId(null);
    setIsFormOpen(true);
  };

  const handleEditStudent = (student) => {
    setFormState({
      studentId: student.studentId || '',
      name: student.name || '',
      class: student.class || '',
      section: student.section || '',
      parent_phone: student.parent_phone || '',
      parent_email: student.parent_email || '',
      fee_cycle: student.fee_cycle || 'Monthly',
    });
    setEditingStudentId(student.id);
    setIsFormOpen(true);
  };

  const ensureParentAccount = async (email, details = {}) => {
    if (!email) return null;
    const parentQuery = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const existing = await getDocs(parentQuery);
    if (!existing.empty) {
      const existingId = existing.docs[0].id;
      if (details.name || details.phone) {
        const updates = {};
        if (details.name) updates.name = details.name;
        if (details.phone) updates.contactNumber = details.phone;
        if (Object.keys(updates).length > 0) {
          await setDoc(doc(db, 'users', existingId), updates, { merge: true });
        }
      }
      return existingId;
    }

    if (!secondaryAuthRef.current) {
      return null;
    }

    try {
      const defaultPassword = 'elnparent123';
      const parentAuth = secondaryAuthRef.current;
      const userCredential = await createUserWithEmailAndPassword(parentAuth, email, defaultPassword);
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email,
        name: details.name || email.split('@')[0],
        role: 'parent',
        contactNumber: details.phone || '',
        created_at: serverTimestamp(),
      });
      return userCredential.user.uid;
    } catch (error) {
      if (error?.code === 'auth/email-already-in-use') {
        const checkAgain = await getDocs(parentQuery);
        if (!checkAgain.empty) {
          const existingId = checkAgain.docs[0].id;
          if (details.name || details.phone) {
            const updates = {};
            if (details.name) updates.name = details.name;
            if (details.phone) updates.contactNumber = details.phone;
            if (Object.keys(updates).length > 0) {
              await setDoc(doc(db, 'users', existingId), updates, { merge: true });
            }
          }
          return existingId;
        }
      }
      console.warn('Parent account creation skipped', error);
      return null;
    }
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]:
        name === 'parent_phone'
          ? value.replace(/[^0-9+]/g, '')
          : value,
    }));
  };

  const handleStudentSubmit = async (event) => {
    event.preventDefault();
    setFormSubmitting(true);

    try {
      const feeAmount = getFeeAmountFromStructure(formState.class, formState.fee_cycle);
      if (feeAmount <= 0) {
        triggerToast('Fee structure missing for selected class and cycle.', 'error');
        setFormSubmitting(false);
        return;
      }
      const baseData = {
        studentId: formState.studentId.trim(),
        name: formState.name.trim(),
        class: formState.class,
        section: formState.section.trim(),
        parent_phone: formState.parent_phone.trim(),
        parent_email: formState.parent_email.trim().toLowerCase(),
        fee_cycle: formState.fee_cycle,
        fee_amount: feeAmount,
        due_date: feeStructureDraft.defaultDueDate || '',
        status: 'Pending',
        term: settingsState.currentTerm || '',
        session: feeStructureDraft.session || '',
      };

      if (editingStudentId) {
        const studentRef = doc(db, 'students', editingStudentId);
        const existingSnap = await getDoc(studentRef);
        const existingData = existingSnap.exists() ? existingSnap.data() : {};
        const parentUid =
          existingData.parent_uid ||
          (await ensureParentAccount(baseData.parent_email, {
            name: existingData.parent_name || baseData.parent_email.split('@')[0],
            phone: baseData.parent_phone,
          }));
        const preservedBalance = Number(existingData.balance ?? feeAmount);
        const updatedStatus = preservedBalance <= 0 ? 'Paid' : existingData.status || 'Pending';
        await updateDoc(studentRef, {
          ...baseData,
          balance: preservedBalance,
          status: updatedStatus,
          parent_uid: parentUid || existingData.parent_uid || '',
          parent_name: existingData.parent_name || baseData.parent_email.split('@')[0],
          updated_at: serverTimestamp(),
        });
        if (parentUid) {
          await setDoc(
            doc(db, 'users', parentUid),
            {
              email: baseData.parent_email,
              name: baseData.parent_email.split('@')[0],
              contactNumber: baseData.parent_phone || '',
              role: 'parent',
            },
            { merge: true },
          );
        }
        triggerToast('Student updated successfully.');
      } else {
        const parentUid = await ensureParentAccount(baseData.parent_email, {
          name: baseData.parent_email.split('@')[0],
          phone: baseData.parent_phone,
        });
        const newStudent = await addDoc(collection(db, 'students'), {
          ...baseData,
          balance: feeAmount,
          parent_uid: parentUid || '',
          created_at: serverTimestamp(),
        });
        if (parentUid) {
          const parentRef = doc(db, 'users', parentUid);
          await setDoc(
            parentRef,
            {
              email: baseData.parent_email,
              name: baseData.parent_email.split('@')[0],
              role: 'parent',
              contactNumber: baseData.parent_phone || '',
              children: arrayUnion(newStudent.id),
            },
            { merge: true },
          );
        }
        triggerToast('Student added successfully.');
      }

      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving student', error);
      triggerToast('Unable to save student record. Please try again.', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleStoreChargeChange = (event) => {
    const { name, value } = event.target;
    setStoreChargeForm((prev) => ({
      ...prev,
      [name]: name === 'amount' ? value.replace(/[^0-9.]/g, '') : value,
    }));
  };

  const handleAddStoreCharge = async (event) => {
    event.preventDefault();
    if (!storeChargeForm.studentId || !storeChargeForm.itemName.trim()) {
      triggerToast('Please select a student and enter item details.', 'error');
      return;
    }
    const amountValue = Number(storeChargeForm.amount || 0);
    if (amountValue <= 0) {
      triggerToast('Amount must be greater than zero.', 'error');
      return;
    }

    const student = students.find((item) => item.id === storeChargeForm.studentId);
    if (!student) {
      triggerToast('Selected student not found.', 'error');
      return;
    }

    setStoreChargeSubmitting(true);
    try {
      const chargeDate = storeChargeForm.date || new Date().toISOString().slice(0, 10);
      const docRef = await addDoc(collection(db, 'store_charges'), {
        student_doc_id: student.id,
        studentId: student.studentId || student.id,
        student_name: student.name,
        class: student.class || '',
        item_name: storeChargeForm.itemName.trim(),
        amount: amountValue,
        charge_date: chargeDate,
        parent_email: student.parent_email || '',
        parent_uid: student.parent_uid || '',
        paid: false,
        created_at: serverTimestamp(),
      });
      const optimisticCharge = {
        id: docRef.id,
        student_doc_id: student.id,
        studentId: student.studentId || student.id,
        student_name: student.name,
        class: student.class || '',
        item_name: storeChargeForm.itemName.trim(),
        amount: amountValue,
        charge_date: chargeDate,
        parent_email: student.parent_email || '',
        parent_uid: student.parent_uid || '',
        paid: false,
        created_at: new Date().toISOString(),
      };
      setStoreCharges((prev) => [optimisticCharge, ...prev.filter((item) => item.id !== optimisticCharge.id)]);
      setStoreChargeForm({
        studentId: '',
        itemName: '',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
      });
      triggerToast('Store charge added.', 'success');
    } catch (error) {
      console.error('Store charge error', error);
      triggerToast('Unable to add store charge. Please try again.', 'error');
    } finally {
      setStoreChargeSubmitting(false);
    }
  };

  const handleTransactionFilterChange = (event) => {
    const { name, value } = event.target;
    setTransactionFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleExportTransactions = () => {
    const header = [
      'Date',
      'Student Name',
      'Class',
      'Amount',
      'Mode',
      'Transaction ID',
      'Month',
      'Status',
    ];
    const rows = filteredTransactions.map((entry) => {
      const dateValue = entry.date?.toDate
        ? entry.date.toDate().toLocaleString()
        : entry.date || '';
      return [
        dateValue,
        entry.student_name || '',
        entry.class || '',
        Number(entry.amount || 0).toFixed(2),
        entry.mode || '',
        entry.transaction_id || '',
        resolveTransactionMonthLabel(entry),
        entry.status || '',
      ];
    });
    const csvContent = [header, ...rows].map((line) => line.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'transactions-log.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFeeStructureFieldChange = (event) => {
    const { name, value } = event.target;
    setFeeStructureDraft((prev) => ({ ...prev, [name]: value }));
  };

  const handleFeeValueChange = (className, field, rawValue) => {
    setFeeStructureDraft((prev) => ({
      ...prev,
      fees: {
        ...prev.fees,
        [className]: {
          ...prev.fees[className],
          [field]: rawValue.replace(/[^0-9.]/g, ''),
        },
      },
    }));
  };

  const handleFeeStructureSave = async (event) => {
    event.preventDefault();
    setFeeStructureSaving(true);
    try {
      const payload = {
        session: feeStructureDraft.session || '',
        defaultDueDate: feeStructureDraft.defaultDueDate || '',
        fees: {},
        updated_at: serverTimestamp(),
      };
      CLASS_OPTIONS.forEach((cls) => {
        const entry = feeStructureDraft.fees?.[cls] || {};
        const monthly = Number(entry.monthly || 0);
        const quarterly = Number(entry.quarterly || 0);
        const halfYearly = Number(entry.halfYearly || quarterly * 2 || monthly * 6);
        payload.fees[cls] = {
          monthly,
          quarterly,
          halfYearly,
        };
      });
      await setDoc(doc(db, 'settings', 'feestructure'), payload, { merge: true });
      triggerToast('Fee settings saved successfully.', 'success');
    } catch (error) {
      console.error('Error saving fee structure', error);
      triggerToast('Unable to save fee settings. Please try again.', 'error');
    } finally {
      setFeeStructureSaving(false);
    }
  };

  const handleSendReminder = async (student, { silent = false } = {}) => {
    try {
      const parentUid = student.parent_uid || (await ensureParentAccount(student.parent_email));
      const reminderMessage = settingsState.reminderTemplate.replace(
        '{{due_date}}',
        student.due_date || 'soon',
      );
      await addDoc(collection(db, 'reminders'), {
        studentId: student.studentId || student.id,
        parent_email: student.parent_email,
        due_date: student.due_date,
        status: 'Sent',
        channel: 'in-app',
        created_at: serverTimestamp(),
      });
      if (parentUid) {
        await addDoc(collection(db, 'notifications'), {
          user_uid: parentUid,
          type: 'reminder',
          title: 'Fee reminder',
          message: reminderMessage,
          created_at: serverTimestamp(),
          read: false,
        });
      }
      if (!silent) {
        alert('Reminder queued successfully.');
      }
    } catch (error) {
      console.error('Reminder error', error);
      if (!silent) {
        alert('Unable to send reminder.');
      }
    }
  };

  const handleBulkReminder = async () => {
    setBulkSending(true);
    try {
      const targets = students.filter((student) => student.status === 'Pending' || student.status === 'Overdue');
      for (const student of targets) {
        // eslint-disable-next-line no-await-in-loop
        await handleSendReminder(student, { silent: true });
      }
      alert('Bulk reminders have been created.');
    } finally {
      setBulkSending(false);
    }
  };

  const openHistory = async (student) => {
    const historyQuery = query(
      collection(db, 'payments'),
      where('studentId', '==', student.studentId || student.id),
      orderBy('date', 'desc'),
    );
    const historySnapshot = await getDocs(historyQuery);
    const entries = historySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    setHistoryContext({ open: true, student, entries });
  };

  const handleMarkPaid = async (student) => {
    const amountToClear = Number(student.balance ?? student.fee_amount ?? 0);
    if (amountToClear <= 0) {
      triggerToast('No outstanding balance for this student.', 'error');
      return;
    }
    try {
      const studentRef = doc(db, 'students', student.id);
      await updateDoc(studentRef, {
        balance: 0,
        status: 'Paid',
        updated_at: serverTimestamp(),
      });
      await addDoc(collection(db, 'payments'), {
        studentId: student.studentId || student.id,
        student_name: student.name,
        class: student.class,
        parent_uid: student.parent_uid || '',
        parent_email: student.parent_email || '',
        amount: amountToClear,
        mode: 'Cash',
        date: serverTimestamp(),
        term: settingsState.currentTerm || '',
        fee_type: 'Manual Adjustment',
        status: 'Success',
      });
      await logTransactionEntry({
        student,
        amount: amountToClear,
        mode: 'Cash',
        transactionId: '',
        status: 'Success',
      });
      triggerToast('Payment recorded successfully.', 'success');
    } catch (error) {
      console.error('Error marking paid', error);
      triggerToast('Unable to update record.', 'error');
    }
  };

  const handleGenerateCsv = () => {
    const header = [
      'Student ID',
      'Name',
      'Class',
      'Status',
      'Fee Amount',
      'Balance',
      'Due Date',
      'Parent Email',
    ];
    const rows = filteredStudents.map((student) => [
      student.studentId || student.id,
      student.name,
      student.class,
      student.status,
      Number(student.fee_amount || 0).toFixed(2),
      Number(student.balance ?? 0).toFixed(2),
      student.due_date || '',
      student.parent_email || '',
    ]);
    const csvContent = [header, ...rows].map((line) => line.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'accountant-report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSettingsChange = (event) => {
    const { name, value } = event.target;
    setSettingsState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSettingsSave = async (event) => {
    event.preventDefault();
    setSavingSettings(true);
    try {
      await setDoc(
        doc(db, 'settings', 'general'),
        {
          currentTerm: settingsState.currentTerm,
          defaultDueDate: settingsState.defaultDueDate,
          reminderTemplate: settingsState.reminderTemplate,
          updated_at: serverTimestamp(),
        },
        { merge: true },
      );
      alert('Settings saved.');
    } catch (error) {
      console.error('Settings error', error);
      alert('Unable to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/');
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-cardinal">
        <Head>
          <title>Accountant Dashboard</title>
        </Head>
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-cardinal/40 border-t-cardinal" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Head>
        <title>Accountant Dashboard · EL-NODE Pay</title>
      </Head>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Accountant Dashboard</h1>
            <p className="text-sm text-slate-600">
              Bird’s-eye view of fee collections and student payments.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleOpenAddStudent}
              className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90"
            >
              Add Student
            </button>
            <button
              type="button"
              onClick={handleGenerateCsv}
              className="rounded-xl border border-cardinal px-4 py-2 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10"
            >
              Generate Report
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <nav className="flex flex-wrap gap-3">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'records', label: 'Student Payment Records' },
            { id: 'fee-settings', label: 'Fee Settings' },
            { id: 'store-charges', label: 'Store Charges' },
            { id: 'transactions', label: 'Transactions Log' },
            { id: 'reminders', label: 'Reminders & Notifications' },
            { id: 'settings', label: 'Automation Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-cardinal text-white shadow'
                  : 'bg-white text-slate-600 shadow-sm hover:bg-cardinal/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' && (
          <section className="mt-8 space-y-8">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Fees Collected (This Month)</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">
                  ₹{monthMetrics.monthTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Year to date: ₹{monthMetrics.yearTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Pending Payments</h3>
                <p className="mt-3 text-2xl font-semibold text-amber-600">
                  ₹{monthMetrics.pendingTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="mt-2 text-xs text-slate-500">Overdue students: {monthMetrics.overdueCount}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Upcoming Due Dates</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{monthMetrics.upcomingCount}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Paid / Unpaid: {monthMetrics.paidCount}/{monthMetrics.unpaidCount}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Collections (Last 6 months)</h3>
                <Bar
                  data={{
                    labels: monthMetrics.monthLabels,
                    datasets: [
                      {
                        label: 'Amount (₹)',
                        data: monthMetrics.monthValues,
                        backgroundColor: '#A31F36',
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                      title: { display: false },
                    },
                  }}
                />
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Students Paid vs Pending</h3>
                <Pie
                  data={{
                    labels: ['Paid', 'Unpaid'],
                    datasets: [
                      {
                        data: [monthMetrics.paidCount, monthMetrics.unpaidCount],
                        backgroundColor: ['#047857', '#f59e0b'],
                      },
                    ],
                  }}
                  options={{
                    plugins: {
                      legend: { position: 'bottom' },
                    },
                  }}
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Outstanding Payments</h3>
                <ul className="mt-4 space-y-3 text-sm">
                  {monthMetrics.outstandingList.length === 0 && (
                    <li className="text-slate-500">No outstanding balances. 🎉</li>
                  )}
                  {monthMetrics.outstandingList.map((item) => (
                    <li key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                      <div>
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">Class {item.class}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-rose-600">
                          ₹{item.balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-xs text-slate-500">{item.status}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Revenue by Fee Category</h3>
                <ul className="mt-4 space-y-3 text-sm">
                  {Object.keys(monthMetrics.revenueByCategory).length === 0 && (
                    <li className="text-slate-500">No payments recorded yet.</li>
                  )}
                  {Object.entries(monthMetrics.revenueByCategory).map(([category, amount]) => (
                    <li key={category} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                      <span className="font-medium text-slate-700">{category}</span>
                      <span className="font-semibold text-slate-900">
                        ₹{amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'records' && (
          <section className="mt-8 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Student Payment Records</h2>
                  <p className="text-sm text-slate-500">Manage student dues, history, and reminders.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <select
                    name="class"
                    value={filters.class}
                    onChange={handleFilterChange}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    <option value="All">All Classes</option>
                    {CLASS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select
                    name="status"
                    value={filters.status}
                    onChange={handleFilterChange}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    name="term"
                    value={filters.term}
                    onChange={handleFilterChange}
                    placeholder="Term"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  />
                  <input
                    name="search"
                    value={filters.search}
                    onChange={handleFilterChange}
                    placeholder="Search"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  />
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Student ID</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Class</th>
                      <th className="px-4 py-3">Fee Amount</th>
                      <th className="px-4 py-3">Paid</th>
                      <th className="px-4 py-3">Balance</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((student) => {
                      const balance = Number(student.balance ?? student.fee_amount ?? 0);
                      const total = Number(student.fee_amount ?? 0);
                      const paid = Math.max(total - balance, 0);
                      return (
                        <tr key={student.id} className="transition hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-medium text-slate-700">{student.studentId || student.id}</td>
                          <td className="px-4 py-3 text-slate-700">{student.name}</td>
                          <td className="px-4 py-3 text-slate-700">{student.class}</td>
                          <td className="px-4 py-3 text-slate-700">₹{total.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-slate-700">₹{paid.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-slate-700">₹{balance.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-slate-500">{student.due_date || '-'}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                statusBadgeClasses[student.status] || 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {student.status || 'Pending'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-2 text-xs font-medium">
                              <button
                                type="button"
                                onClick={() => openHistory(student)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 transition hover:bg-slate-100"
                              >
                                View History
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditStudent(student)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 transition hover:bg-slate-100"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSendReminder(student)}
                                className="rounded-lg border border-cardinal px-3 py-1.5 text-cardinal transition hover:bg-cardinal/10"
                              >
                                Send Reminder
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMarkPaid(student)}
                                className="rounded-lg bg-cardinal px-3 py-1.5 text-white transition hover:bg-cardinal/90"
                              >
                                Mark as Paid
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredStudents.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                          {loadingStudents ? 'Loading student records…' : 'No students match the current filters.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'fee-settings' && (
          <section className="mt-8 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Fee Structure</h2>
                <p className="text-sm text-slate-500">
                  Manage tuition fee slabs, billing cycles, and the default due date for reminders.
                </p>
              </div>
              <form className="mt-6 space-y-6" onSubmit={handleFeeStructureSave}>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                    Session
                    <select
                      name="session"
                      value={feeStructureDraft.session}
                      onChange={handleFeeStructureFieldChange}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    >
                      <option value="">Select session</option>
                      {sessionOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                    Default Due Date
                    <input
                      type="date"
                      name="defaultDueDate"
                      value={feeStructureDraft.defaultDueDate || ''}
                      onChange={handleFeeStructureFieldChange}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p className="font-medium text-slate-900">Fee Cycle Notes</p>
                    <p className="mt-1">Half-yearly dues are auto-calculated from quarterly fees.</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Class</th>
                        <th className="px-4 py-3 text-left">Monthly Fee (₹)</th>
                        <th className="px-4 py-3 text-left">Quarterly Fee (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {CLASS_OPTIONS.map((item) => (
                        <tr key={item}>
                          <td className="px-4 py-3 font-medium text-slate-700">{item}</td>
                          <td className="px-4 py-3">
                            <input
                              value={feeStructureDraft.fees?.[item]?.monthly ?? ''}
                              onChange={(event) => handleFeeValueChange(item, 'monthly', event.target.value)}
                              placeholder="0"
                              inputMode="decimal"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              value={feeStructureDraft.fees?.[item]?.quarterly ?? ''}
                              onChange={(event) => handleFeeValueChange(item, 'quarterly', event.target.value)}
                              placeholder="0"
                              inputMode="decimal"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={feeStructureSaving}
                    className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {feeStructureSaving ? 'Saving…' : 'Save Fee Settings'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {activeTab === 'store-charges' && (
          <section className="mt-8 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Store Charges</h2>
                <p className="text-sm text-slate-500">Add uniforms, books, and other purchases to student accounts.</p>
              </div>
              <form className="mt-6 grid gap-4 md:grid-cols-4" onSubmit={handleAddStoreCharge}>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Student
                  <select
                    name="studentId"
                    value={storeChargeForm.studentId}
                    onChange={handleStoreChargeChange}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    <option value="">Select student</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} · {student.class}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Item Name
                  <input
                    name="itemName"
                    value={storeChargeForm.itemName}
                    onChange={handleStoreChargeChange}
                    placeholder="Sports Kit"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Amount (₹)
                  <input
                    name="amount"
                    value={storeChargeForm.amount}
                    onChange={handleStoreChargeChange}
                    placeholder="0"
                    inputMode="decimal"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Date
                  <input
                    type="date"
                    name="date"
                    value={storeChargeForm.date}
                    onChange={handleStoreChargeChange}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  />
                </label>
                <div className="md:col-span-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={storeChargeSubmitting}
                    className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {storeChargeSubmitting ? 'Adding…' : 'Add Charge'}
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Recent Charges</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Item</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {storeCharges.map((charge) => {
                      const dateLabel = charge.charge_date
                        ? new Date(charge.charge_date).toLocaleDateString()
                        : charge.created_at?.toDate
                          ? charge.created_at.toDate().toLocaleDateString()
                          : charge.created_at
                            ? new Date(charge.created_at).toLocaleDateString()
                            : '-';
                      return (
                        <tr key={charge.id}>
                          <td className="px-4 py-3 text-slate-600">{dateLabel}</td>
                          <td className="px-4 py-3 text-slate-700">{charge.student_name}</td>
                          <td className="px-4 py-3 text-slate-700">{charge.item_name}</td>
                          <td className="px-4 py-3 text-slate-900">₹{Number(charge.amount || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      );
                    })}
                    {storeCharges.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                          No store charges recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'transactions' && (
          <section className="mt-8 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Transactions Log</h2>
                  <p className="text-sm text-slate-500">
                    Central ledger of all online and manual fee collections.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <select
                    name="month"
                    value={transactionFilters.month}
                    onChange={handleTransactionFilterChange}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
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
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    <option value="All">All Modes</option>
                    <option value="Cash">Cash</option>
                    <option value="Online">Online</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleExportTransactions}
                    className="rounded-xl border border-cardinal px-4 py-2 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10"
                  >
                    Export to Excel
                  </button>
                </div>
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Class</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Mode</th>
                      <th className="px-4 py-3 text-left">Transaction ID</th>
                      <th className="px-4 py-3 text-left">Month</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransactions.map((entry) => {
                      const dateValue = entry.date?.toDate
                        ? entry.date.toDate().toLocaleString()
                        : entry.date || '-';
                      return (
                        <tr key={entry.id}>
                          <td className="px-4 py-3 text-slate-600">{dateValue}</td>
                          <td className="px-4 py-3 text-slate-700">{entry.student_name}</td>
                          <td className="px-4 py-3 text-slate-700">{entry.class}</td>
                          <td className="px-4 py-3 text-slate-900">₹{Number(entry.amount || 0).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-slate-700">{entry.mode || '-'}</td>
                          <td className="px-4 py-3 text-slate-700">{entry.transaction_id || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{resolveTransactionMonthLabel(entry)}</td>
                          <td className="px-4 py-3 text-slate-700">{entry.status || '-'}</td>
                        </tr>
                      );
                    })}
                    {filteredTransactions.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                          No transactions recorded for the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'reminders' && (
          <section className="mt-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Reminders & Notifications</h2>
                <p className="text-sm text-slate-500">
                  Track nudges sent to parents and trigger bulk reminders for pending dues.
                </p>
              </div>
              <button
                type="button"
                onClick={handleBulkReminder}
                disabled={bulkSending}
                className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {bulkSending ? 'Sending…' : 'Send Bulk Reminder'}
              </button>
            </div>
            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Student</th>
                    <th className="px-4 py-3 text-left">Parent Email</th>
                    <th className="px-4 py-3 text-left">Due Date</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reminders.map((reminder) => (
                    <tr key={reminder.id}>
                      <td className="px-4 py-3">{reminder.studentId}</td>
                      <td className="px-4 py-3">{reminder.parent_email}</td>
                      <td className="px-4 py-3">{reminder.due_date || '-'}</td>
                      <td className="px-4 py-3">{reminder.status}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {reminder.created_at?.toDate
                          ? reminder.created_at.toDate().toLocaleString()
                          : reminder.created_at || '-'}
                      </td>
                    </tr>
                  ))}
                  {reminders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                        {loadingReminders ? 'Loading reminders…' : 'No reminders logged yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="mt-8">
            <SettingsPanel
              settingsState={settingsState}
              onChange={handleSettingsChange}
              onSave={handleSettingsSave}
              isSaving={savingSettings}
            />
          </section>
        )}
      </main>

      {isFormOpen && (
        <StudentFormModal
          isEditing={Boolean(editingStudentId)}
          formState={formState}
          onChange={handleFormChange}
          onSubmit={handleStudentSubmit}
          onClose={() => setIsFormOpen(false)}
          isSubmitting={formSubmitting}
        />
      )}

      {historyContext.open && (
        <PaymentHistoryModal
          student={historyContext.student}
          payments={historyContext.entries}
          onClose={() => setHistoryContext({ open: false, student: null, entries: [] })}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-2xl px-4 py-3 text-sm shadow-lg transition ${
            toast.tone === 'error'
              ? 'bg-rose-500 text-white'
              : toast.tone === 'warning'
                ? 'bg-amber-500 text-white'
                : 'bg-emerald-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default AccountantDashboard;
