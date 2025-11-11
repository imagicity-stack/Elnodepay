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

const CLASS_OPTIONS = ['UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const STATUS_OPTIONS = ['All', 'Paid', 'Pending', 'Overdue'];

const emptyStudentForm = {
  studentId: '',
  name: '',
  class: '',
  section: '',
  parent_email: '',
  fee_amount: '',
  balance: '',
  status: 'Pending',
  due_date: '',
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

const StudentFormModal = ({ isEditing, formState, onChange, onSubmit, onClose, isSubmitting }) => (
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
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 md:col-span-2">
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
          Fee Amount (₹)
          <input
            name="fee_amount"
            value={formState.fee_amount}
            onChange={onChange}
            required
            inputMode="decimal"
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="25000"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Current Balance (₹)
          <input
            name="balance"
            value={formState.balance}
            onChange={onChange}
            inputMode="decimal"
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="25000"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Due Date
          <input
            type="date"
            name="due_date"
            value={formState.due_date}
            onChange={onChange}
            required
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Status
          <select
            name="status"
            value={formState.status}
            onChange={onChange}
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            {['Pending', 'Paid', 'Overdue'].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
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

    return () => {
      unsubscribeStudents();
      unsubscribePayments();
      unsubscribeReminders();
      unsubscribeSettings();
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
    setFormState({ ...emptyStudentForm, due_date: settingsState.defaultDueDate || '' });
    setEditingStudentId(null);
    setIsFormOpen(true);
  };

  const handleEditStudent = (student) => {
    setFormState({
      studentId: student.studentId || '',
      name: student.name || '',
      class: student.class || '',
      section: student.section || '',
      parent_email: student.parent_email || '',
      fee_amount: String(student.fee_amount ?? ''),
      balance: String(student.balance ?? ''),
      status: student.status || 'Pending',
      due_date: student.due_date || '',
    });
    setEditingStudentId(student.id);
    setIsFormOpen(true);
  };

  const ensureParentAccount = async (email) => {
    if (!email) return null;
    const parentQuery = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const existing = await getDocs(parentQuery);
    if (!existing.empty) {
      return existing.docs[0].id;
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
        name: email.split('@')[0],
        role: 'parent',
        created_at: serverTimestamp(),
      });
      return userCredential.user.uid;
    } catch (error) {
      if (error?.code === 'auth/email-already-in-use') {
        const checkAgain = await getDocs(parentQuery);
        if (!checkAgain.empty) {
          return checkAgain.docs[0].id;
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
      [name]: ['fee_amount', 'balance'].includes(name)
        ? value.replace(/[^0-9.]/g, '')
        : value,
    }));
  };

  const handleStudentSubmit = async (event) => {
    event.preventDefault();
    setFormSubmitting(true);

    try {
      const feeAmount = Number(formState.fee_amount || 0);
      const balanceValue =
        formState.balance !== '' ? Number(formState.balance || 0) : feeAmount;
      const safeBalance = balanceValue < 0 ? 0 : balanceValue;
      const baseData = {
        studentId: formState.studentId.trim(),
        name: formState.name.trim(),
        class: formState.class,
        section: formState.section.trim(),
        parent_email: formState.parent_email.trim().toLowerCase(),
        fee_amount: feeAmount,
        balance: safeBalance,
        due_date: formState.due_date,
        status: formState.status || 'Pending',
        term: settingsState.currentTerm || '',
      };

      if (editingStudentId) {
        const studentRef = doc(db, 'students', editingStudentId);
        const existingSnap = await getDoc(studentRef);
        const existingData = existingSnap.exists() ? existingSnap.data() : {};
        const parentUid = existingData.parent_uid || (await ensureParentAccount(baseData.parent_email));
        await updateDoc(studentRef, {
          ...baseData,
          parent_uid: parentUid || existingData.parent_uid || '',
          updated_at: serverTimestamp(),
        });
      } else {
        const parentUid = await ensureParentAccount(baseData.parent_email);
        const newStudent = await addDoc(collection(db, 'students'), {
          ...baseData,
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
            },
            { merge: true },
          );
          await updateDoc(parentRef, {
            children: arrayUnion(newStudent.id),
          });
        }
      }

      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving student', error);
      alert('Unable to save student record. Please try again.');
    } finally {
      setFormSubmitting(false);
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
    if (amountToClear <= 0) return;
    try {
      const studentRef = doc(db, 'students', student.id);
      await updateDoc(studentRef, {
        balance: 0,
        status: 'Paid',
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
    } catch (error) {
      console.error('Error marking paid', error);
      alert('Unable to update record.');
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
            { id: 'reminders', label: 'Reminders & Notifications' },
            { id: 'settings', label: 'Settings' },
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
    </div>
  );
};

export default AccountantDashboard;
