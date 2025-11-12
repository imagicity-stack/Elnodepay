import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import {
  createUserWithEmailAndPassword,
  getAuth as getFirebaseAuth,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
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

const CLASS_OPTIONS = ['Nursery', 'Kg1', 'Kg2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const SESSION_OPTIONS = ['2023-24', '2024-25', '2025-26', '2026-27', '2027-28'];
const STATUS_OPTIONS = ['All', 'Paid', 'Pending', 'Overdue'];
const REQUEST_CYCLE_OPTIONS = [
  { id: 'Monthly', label: 'Monthly' },
  { id: 'Quarterly', label: 'Quarterly' },
  { id: 'Half-Yearly', label: '6 Months' },
];

const SCHOOL_NAME = 'Elden Heights School - Silwar Hazaribagh';

const REPORT_DEFAULT_FILTERS = {
  class: 'All',
  status: 'All',
  cycle: 'All',
  session: 'All',
  term: '',
  paymentMode: 'All',
  reminder: 'All',
  dueFrom: '',
  dueTo: '',
  search: '',
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value?.toDate) {
    const parsed = value.toDate();
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const parseAmountValue = (value) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const resolveRequestCycle = (request = {}) => {
  const rawCycle =
    request.type ||
    request.cycle ||
    request.fee_cycle ||
    request.billing_cycle ||
    request.frequency ||
    '';
  const normalised = `${rawCycle}`.toLowerCase();
  if (normalised.includes('half') || normalised.includes('6')) {
    return '6 Months';
  }
  if (normalised.includes('quarter')) {
    return 'Quarterly';
  }
  if (normalised.includes('month')) {
    return 'Monthly';
  }
  if (normalised.includes('annual') || normalised.includes('year')) {
    return 'Annual';
  }
  return rawCycle || 'Other';
};

const calculateFeeRequestTotal = (request = {}) => {
  const directTotal = parseAmountValue(request.amount_total ?? request.amount);
  if (directTotal > 0) {
    return directTotal;
  }
  const base = parseAmountValue(request.base_amount);
  const custom = parseAmountValue(request.custom_amount);
  const extras = parseAmountValue(request.extras_total);
  if (base + custom + extras > 0) {
    return base + custom + extras;
  }
  const breakdown = request.breakdown && typeof request.breakdown === 'object' ? request.breakdown : {};
  return Object.values(breakdown).reduce((sum, item) => sum + parseAmountValue(item?.amount), 0);
};

const normalisePaymentMode = (mode) => {
  if (!mode) return 'Unspecified';
  const value = `${mode}`.toLowerCase();
  if (value === 'cash') {
    return 'Cash';
  }
  if (value === 'online') {
    return 'Online';
  }
  if (value === 'upi' || value === 'upi payment') {
    return 'Online';
  }
  return mode;
};

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

const SUPER_ADMIN_PASSWORD = 'yesdeletethestudent';

const Modal = ({ title, children, onClose, size = 'lg' }) => {
  const maxWidthClasses = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-2xl',
    xl: 'max-w-3xl',
  };
  const selectedWidth = maxWidthClasses[size] || maxWidthClasses.lg;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
      <div className={`w-full ${selectedWidth} rounded-2xl bg-white shadow-2xl`}>
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
};

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

const FeeRequestModal = ({
  student,
  formState,
  cycleOptions,
  amounts,
  onFieldChange,
  onSubmit,
  onClose,
  isSubmitting,
}) => (
  <Modal title={`Create Fee Request · ${student?.name || ''}`} onClose={onClose}>
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Billing Cycle
          <select
            name="cycle"
            value={formState.cycle}
            onChange={(event) => onFieldChange(event.target.name, event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            {cycleOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Due Date
          <input
            type="date"
            name="dueDate"
            value={formState.dueDate}
            onChange={(event) => onFieldChange(event.target.name, event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Custom Fee (optional)
          <input
            name="customAmount"
            value={formState.customAmount}
            onChange={(event) => onFieldChange(event.target.name, event.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Custom Fee Note
          <input
            name="customNote"
            value={formState.customNote}
            onChange={(event) => onFieldChange(event.target.name, event.target.value)}
            placeholder="Reason for custom amount"
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Others Amount (optional)
          <input
            name="othersAmount"
            value={formState.othersAmount}
            onChange={(event) => onFieldChange(event.target.name, event.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Others Name (optional)
          <input
            name="othersLabel"
            value={formState.othersLabel}
            onChange={(event) => onFieldChange(event.target.name, event.target.value)}
            placeholder="Lab fee, picnic…"
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Store Charges
          <select
            name="includeStore"
            value={formState.includeStore ? 'yes' : 'no'}
            onChange={(event) => onFieldChange('includeStore', event.target.value === 'yes')}
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
      </div>
      {formState.includeStore && (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Store Item Name
            <input
              name="storeItem"
              value={formState.storeItem}
              onChange={(event) => onFieldChange(event.target.name, event.target.value)}
              placeholder="Uniform, books…"
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Store Amount
            <input
              name="storeAmount"
              value={formState.storeAmount}
              onChange={(event) => onFieldChange(event.target.name, event.target.value)}
              placeholder="0"
              inputMode="decimal"
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </label>
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Breakdown</p>
        <ul className="mt-2 space-y-1">
          <li className="flex justify-between">
            <span>{cycleOptions.find((item) => item.id === formState.cycle)?.label || 'Tuition'}</span>
            <span>₹{amounts.base.toLocaleString('en-IN')}</span>
          </li>
          {amounts.custom > 0 && (
            <li className="flex justify-between">
              <span>{formState.customNote.trim() || 'Custom Fee'}</span>
              <span>₹{amounts.custom.toLocaleString('en-IN')}</span>
            </li>
          )}
          {amounts.others > 0 && (
            <li className="flex justify-between">
              <span>{formState.othersLabel.trim() || 'Others'}</span>
              <span>₹{amounts.others.toLocaleString('en-IN')}</span>
            </li>
          )}
          {amounts.store > 0 && (
            <li className="flex justify-between">
              <span>{formState.storeItem.trim() || 'Store Item'}</span>
              <span>₹{amounts.store.toLocaleString('en-IN')}</span>
            </li>
          )}
        </ul>
        <p className="mt-3 text-sm font-semibold text-slate-900">
          Total due: ₹{amounts.total.toLocaleString('en-IN')}
        </p>
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
          disabled={isSubmitting}
          className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? 'Creating…' : 'Create Request'}
        </button>
      </div>
    </form>
  </Modal>
);

const PaymentHistoryModal = ({ student, payments, onClose, onDownload }) => (
  <Modal title={`Payment history · ${student?.name || ''}`} onClose={onClose} size="xl">
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-slate-600">
          Showing all payments made by {student?.parent_email ? `the parent (${student.parent_email})` : 'this student'}.
        </p>
        <button
          type="button"
          onClick={onDownload}
          disabled={!payments.length}
          className="rounded-lg border border-cardinal px-3 py-1.5 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Download Report
        </button>
      </div>
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

const StudentActionsModal = ({
  student,
  onClose,
  onCreateFeeRequest,
  onViewHistory,
  onEdit,
  onDelete,
}) => (
  <Modal title={`Manage · ${student?.name || ''}`} onClose={onClose} size="sm">
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Choose an action for <span className="font-medium text-slate-900">{student?.name}</span>.
      </p>
      <div className="grid gap-2">
        <button
          type="button"
          onClick={onCreateFeeRequest}
          className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-cardinal/90"
        >
          Create Fee Request
        </button>
        <button
          type="button"
          onClick={onViewHistory}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          View History
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Edit Details
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
        >
          Delete Student
        </button>
      </div>
    </div>
  </Modal>
);

const DeleteStudentModal = ({
  student,
  step,
  password,
  error,
  submitting,
  onPasswordChange,
  onVerifyPassword,
  onConfirmDelete,
  onCancel,
}) => (
  <Modal title={`Delete · ${student?.name || 'student'}`} onClose={onCancel} size="sm">
    {step === 'password' ? (
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Enter the super admin password to continue. This action cannot be undone.
        </p>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Super Admin Password</span>
          <input
            type="password"
            value={password}
            onChange={onPasswordChange}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="Enter password"
          />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onVerifyPassword}
            disabled={submitting || !password.trim()}
            className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Verify
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Are you sure you want to permanently delete all data for{' '}
          <span className="font-semibold text-slate-900">{student?.name}</span>?
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            No
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={submitting}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Yes, delete
          </button>
        </div>
      </div>
    )}
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
  const [feeRequests, setFeeRequests] = useState([]);
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
    sort: 'name-asc',
  });
  const [reportFilters, setReportFilters] = useState(() => ({ ...REPORT_DEFAULT_FILTERS }));
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportDownloadState, setReportDownloadState] = useState({ format: null, loading: false });
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
  const [feeRequestContext, setFeeRequestContext] = useState({ open: false, student: null });
  const [feeRequestForm, setFeeRequestForm] = useState({
    cycle: 'Monthly',
    dueDate: '',
    customAmount: '',
    customNote: '',
    othersAmount: '',
    othersLabel: '',
    includeStore: false,
    storeItem: '',
    storeAmount: '',
  });
  const [feeRequestSubmitting, setFeeRequestSubmitting] = useState(false);
  const [transactionsLog, setTransactionsLog] = useState([]);
  const [transactionFilters, setTransactionFilters] = useState({ month: 'All', mode: 'All' });
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [studentActionsContext, setStudentActionsContext] = useState({ open: false, student: null });
  const [deleteContext, setDeleteContext] = useState({
    open: false,
    student: null,
    password: '',
    step: 'password',
    submitting: false,
    error: '',
  });
  const [markPaidContext, setMarkPaidContext] = useState({
    student: null,
    step: 'mode',
    mode: null,
    transactionId: '',
    submitting: false,
    error: '',
  });
  const [toast, setToast] = useState(null);
  const secondaryAuthRef = useRef(null);
  const toastTimerRef = useRef(null);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
    } finally {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('elnode-remember-me');
        window.sessionStorage.removeItem('elnode-remember-me');
      }
      router.replace('/');
    }
  }, [router]); // fix: define before effects to avoid init issues

  const closeStudentActions = () => {
    setStudentActionsContext({ open: false, student: null });
    setSelectedStudentId(null);
  };

  const resetDeleteContext = () => {
    setDeleteContext({ open: false, student: null, password: '', step: 'password', submitting: false, error: '' });
  };

  const resetMarkPaidContext = () => {
    setMarkPaidContext({ student: null, step: 'mode', mode: null, transactionId: '', submitting: false, error: '' });
  };

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
        status: status || 'Paid',
        parent_email: student.parent_email || '',
        parent_uid: student.parent_uid || '',
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

  useEffect(() => {
    if (!authChecked || !user) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('elnode-remember-me') === 'true') {
      return;
    }

    const INACTIVITY_LIMIT = 4 * 60 * 1000;
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    let timerId;

    const resetTimer = () => {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(() => {
        handleSignOut();
      }, INACTIVITY_LIMIT);
    };

    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [authChecked, user, handleSignOut]);

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

    const feeRequestsQuery = query(collection(db, 'fee_requests'), orderBy('created_at', 'desc'));
    const unsubscribeFeeRequests = onSnapshot(
      feeRequestsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setFeeRequests(data);
        console.log('[Sync] fee_requests snapshot received', data.length);
      },
      (error) => {
        console.error('[Sync] fee_requests listener error', error);
      },
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

    const transactionsQuery = query(collection(db, 'transactions_log'), orderBy('date', 'desc'));
    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setTransactionsLog(data);
    });

    return () => {
      unsubscribeStudents();
      unsubscribePayments();
      unsubscribeReminders();
      unsubscribeFeeRequests();
      unsubscribeSettings();
      unsubscribeFeeStructure();
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
    const safeTransactions = Array.isArray(transactionsLog) ? transactionsLog : [];
    const safeReminders = Array.isArray(reminders) ? reminders : [];
    const safeFeeRequests = Array.isArray(feeRequests) ? feeRequests : [];
    const safeStudents = Array.isArray(students) ? students : [];
    const safePayments = Array.isArray(payments) ? payments : [];
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    today.setHours(0, 0, 0, 0);
    const upcomingThreshold = new Date(today);
    upcomingThreshold.setDate(upcomingThreshold.getDate() + 7);
    upcomingThreshold.setHours(23, 59, 59, 999);

    let monthTotal = 0;
    let yearTotal = 0;

    const monthlyMap = new Map();
    const modeTotals = { Cash: 0, Online: 0, Other: 0 };
    const paidTransactions = [];

    safeTransactions.forEach((entry) => {
      const status = (entry.status || '').toLowerCase();
      if (status !== 'paid' && status !== 'success') return;
      const amount = parseAmountValue(entry.amount);
      const entryDate = parseDateValue(entry.date) || parseDateValue(entry.created_at);
      if (!entryDate) return;
      paidTransactions.push({ ...entry, entryDate });
      if (entryDate >= startOfYear) {
        yearTotal += amount;
      }
      if (entryDate >= startOfMonth) {
        monthTotal += amount;
      }
      const modeRaw = (entry.mode || 'Online').toLowerCase();
      const modeKey = modeRaw === 'cash' ? 'Cash' : modeRaw === 'online' ? 'Online' : 'Other';
      modeTotals[modeKey] += amount;
      const monthKey =
        entry.month_key || `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = entry.month_label || entryDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
      const monthExisting = monthlyMap.get(monthKey) || { label: monthLabel, amount: 0 };
      monthlyMap.set(monthKey, {
        label: monthExisting.label || monthLabel,
        amount: monthExisting.amount + amount,
      });
    });

    const transactionDatesByStudent = new Map();
    paidTransactions.forEach(({ studentId, student_doc_id, entryDate }) => {
      const key = studentId || student_doc_id;
      if (!key || !entryDate) return;
      if (!transactionDatesByStudent.has(key)) {
        transactionDatesByStudent.set(key, []);
      }
      transactionDatesByStudent.get(key).push(entryDate);
    });
    transactionDatesByStudent.forEach((dates) => dates.sort((a, b) => a - b));

    const pendingFees = { amount: 0, count: 0 };
    const overdueFees = { amount: 0, count: 0 };
    let upcomingDueCount = 0;
    let storeRevenue = 0;
    let paidRequests = 0;
    let pendingRequests = 0;
    const feeTypeMap = new Map();
    const delays = [];
    const activeParentEmails = new Set();

    const reminderMap = new Map();
    safeReminders.forEach((reminder) => {
      const key = reminder.studentId || reminder.student_id || reminder.student_doc_id;
      if (!key) return;
      const reminderDate =
        parseDateValue(reminder.created_at) ||
        parseDateValue(reminder.sent_at) ||
        parseDateValue(reminder.date);
      const reminderExisting = reminderMap.get(key);
      if (!reminderExisting || (reminderDate && reminderExisting && reminderExisting > reminderDate)) {
        reminderMap.set(key, reminderDate || null);
      } else if (!reminderExisting) {
        reminderMap.set(key, reminderDate || null);
      }
    });

    const todayTime = today.getTime();

    safeFeeRequests.forEach((request) => {
      const status = (request.status || '').toLowerCase();
      const total = calculateFeeRequestTotal(request);
      const dueDate = parseDateValue(request.due_date);
      const cycleKey = resolveRequestCycle(request);
      feeTypeMap.set(cycleKey, (feeTypeMap.get(cycleKey) || 0) + 1);

      if (request.breakdown?.store) {
        storeRevenue += parseAmountValue(request.breakdown.store.amount);
      }

      if (status === 'paid') {
        paidRequests += 1;
      } else {
        pendingRequests += 1;
      }

      if (status === 'pending') {
        pendingFees.amount += total;
        pendingFees.count += 1;
      }

      if (status !== 'paid') {
        if (dueDate && dueDate.getTime() < todayTime) {
          overdueFees.amount += total;
          overdueFees.count += 1;
        } else if (dueDate && dueDate >= today && dueDate <= upcomingThreshold) {
          upcomingDueCount += 1;
        }
      }

      if (status !== 'paid' && request.parent_email) {
        activeParentEmails.add(request.parent_email);
      }

      if (status === 'paid' && dueDate) {
        const paidDate =
          parseDateValue(request.paid_at) ||
          parseDateValue(request.payment_date) ||
          (() => {
            const key = request.studentId || request.student_doc_id;
            const dates = transactionDatesByStudent.get(key) || [];
            if (!dates.length) return null;
            const match = dates.find((date) => !dueDate || date >= dueDate);
            return match || dates[dates.length - 1] || null;
          })();
        if (paidDate) {
          const diffDays = (paidDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24);
          delays.push(diffDays < 0 ? 0 : diffDays);
        }
      }
    });

    const reminderBaseCount = reminderMap.size;
    let reminderConvertedCount = 0;
    reminderMap.forEach((reminderDate, studentKey) => {
      const transactions = transactionDatesByStudent.get(studentKey) || [];
      if (!transactions.length) return;
      const hasPaymentAfterReminder = transactions.some((date) => !reminderDate || date >= reminderDate);
      if (hasPaymentAfterReminder) {
        reminderConvertedCount += 1;
      }
    });

    const monthEntries = Array.from(monthlyMap.entries()).sort((a, b) => (a[0] > b[0] ? 1 : -1));
    const recentEntries = monthEntries.slice(-6);
    const monthLabels = recentEntries.map(([, value]) => value.label);
    const monthValues = recentEntries.map(([, value]) => value.amount);

    const paidStudents = safeStudents.filter((student) => (student.status || '').toLowerCase() === 'paid').length;
    const overdueStudents = safeStudents.filter((student) => (student.status || '').toLowerCase() === 'overdue').length;
    const outstandingList = [...safeStudents]
      .map((student) => ({
        id: student.id,
        name: student.name,
        class: student.class,
        balance: Number(student.balance ?? student.fee_amount ?? 0),
        status: student.status,
      }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);

    const revenueByCategory = safePayments.reduce((acc, payment) => {
      const key = payment.fee_type || 'Tuition';
      acc[key] = (acc[key] || 0) + parseAmountValue(payment.amount);
      return acc;
    }, {});

    const unpaidStudents = safeStudents.length - paidStudents;
    const averageCollectionDelay = delays.length
      ? delays.reduce((sum, value) => sum + value, 0) / delays.length
      : null;
    const reminderConversionRate =
      reminderBaseCount > 0 ? (reminderConvertedCount / reminderBaseCount) * 100 : null;

    const feeTypeDistribution = Array.from(feeTypeMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    return {
      monthTotal,
      yearTotal,
      pendingTotal: pendingFees.amount,
      pendingRequestCount: pendingFees.count,
      overdueFeesAmount: overdueFees.amount,
      overdueRequestCount: overdueFees.count,
      upcomingCount: upcomingDueCount,
      paidCount: paidStudents,
      unpaidCount: unpaidStudents,
      overdueCount: overdueStudents,
      outstandingList,
      revenueByCategory,
      monthLabels,
      monthValues,
      requestStatusCounts: { paid: paidRequests, pending: pendingRequests },
      paymentModeSplit: modeTotals,
      feeTypeDistribution,
      averageCollectionDelay,
      reminderConversionRate,
      reminderBaseCount,
      storeRevenue,
      totalStudents: safeStudents.length,
      activeParents: activeParentEmails.size,
    };
  }, [transactionsLog, feeRequests, reminders, students, payments]);

  const sessionOptions = useMemo(() => {
    if (!feeStructureDraft.session || SESSION_OPTIONS.includes(feeStructureDraft.session)) {
      return SESSION_OPTIONS;
    }
    return [...SESSION_OPTIONS, feeStructureDraft.session];
  }, [feeStructureDraft.session]);

  const transactionMonthOptions = useMemo(() => {
    const safeTransactions = Array.isArray(transactionsLog) ? transactionsLog : [];
    if (!safeTransactions || safeTransactions.length === 0) {
      return [];
    }
    const monthMap = new Map();
    safeTransactions.forEach((entry) => {
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
    const safeTransactions = Array.isArray(transactionsLog) ? transactionsLog : [];
    if (!safeTransactions || safeTransactions.length === 0) {
      return [];
    }
    return safeTransactions.filter((entry) => {
      const matchesMode =
        transactionFilters.mode === 'All' || (entry.mode || 'Online') === transactionFilters.mode;
      if (transactionFilters.month === 'All') {
        return matchesMode;
      }
      const key = resolveTransactionMonthKey(entry);
      return matchesMode && key === transactionFilters.month;
    });
  }, [transactionsLog, transactionFilters]);

  const paidRequestCount = monthMetrics.requestStatusCounts?.paid || 0;
  const pendingRequestCount = monthMetrics.requestStatusCounts?.pending || 0;
  const paymentModeTotals = monthMetrics.paymentModeSplit || { Cash: 0, Online: 0, Other: 0 };
  const feeTypeDistribution = monthMetrics.feeTypeDistribution || [];

  const feeRequestAmounts = useMemo(() => {
    const student = feeRequestContext.student;
    if (!student) {
      return { base: 0, custom: 0, others: 0, store: 0, total: 0 };
    }
    const base = getFeeAmountFromStructure(student.class, feeRequestForm.cycle);
    const parseAmount = (value) => {
      const numeric = Number(value || 0);
      return Number.isFinite(numeric) ? numeric : 0;
    };
    const custom = parseAmount(feeRequestForm.customAmount);
    const others = parseAmount(feeRequestForm.othersAmount);
    const store = feeRequestForm.includeStore ? parseAmount(feeRequestForm.storeAmount) : 0;
    return {
      base,
      custom,
      others,
      store,
      total: base + custom + others + store,
    };
  }, [feeRequestContext.student, feeRequestForm, feeStructureDraft]);

  const filteredStudents = useMemo(() => {
    const safeStudents = Array.isArray(students) ? students : [];
    if (!safeStudents || safeStudents.length === 0) {
      return [];
    }
    const searchValue = filters.search.trim().toLowerCase();
    const filtered = safeStudents.filter((student) => {
      const matchesClass = filters.class === 'All' || student.class === filters.class;
      const matchesStatus = filters.status === 'All' || student.status === filters.status;
      const matchesTerm =
        filters.term === 'All' || (student.term || '').toLowerCase().includes(filters.term.toLowerCase());
      const matchesSearch =
        searchValue.length === 0 ||
        student.name?.toLowerCase().includes(searchValue) ||
        student.studentId?.toLowerCase().includes(searchValue);
      return matchesClass && matchesStatus && matchesTerm && matchesSearch;
    });

    const sorted = [...filtered];
    if (filters.sort === 'class-asc') {
      sorted.sort((a, b) => (a.class || '').localeCompare(b.class || ''));
    } else if (filters.sort === 'balance-desc') {
      sorted.sort(
        (a, b) =>
          Number(b.balance ?? b.fee_amount ?? 0) - Number(a.balance ?? a.fee_amount ?? 0),
      );
    } else {
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return sorted;
  }, [students, filters]);

  const feeRequestReportEntries = useMemo(() => {
    const safeFeeRequests = Array.isArray(feeRequests) ? feeRequests : [];
    const safeStudents = Array.isArray(students) ? students : [];
    const safeReminders = Array.isArray(reminders) ? reminders : [];
    if (!safeFeeRequests || safeFeeRequests.length === 0) {
      return [];
    }
    const studentsByDocId = new Map();
    const studentsByStudentId = new Map();
    safeStudents.forEach((student) => {
      studentsByDocId.set(student.id, student);
      if (student.studentId) {
        studentsByStudentId.set(student.studentId, student);
      }
    });

    const reminderIndex = new Map();
    safeReminders.forEach((reminder) => {
      const keys = [reminder.student_doc_id, reminder.studentId, reminder.student_id]
        .map((value) => (value ? `${value}` : ''))
        .filter(Boolean);
      if (!keys.length) return;
      const due = parseDateValue(reminder.due_date);
      keys.forEach((key) => {
        if (!reminderIndex.has(key)) {
          reminderIndex.set(key, []);
        }
        reminderIndex.get(key).push({ ...reminder, due });
      });
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return safeFeeRequests.map((request) => {
      const studentMatch =
        studentsByDocId.get(request.student_doc_id) ||
        (request.studentId ? studentsByStudentId.get(request.studentId) : null) ||
        null;
      const dueDate = parseDateValue(request.due_date);
      const paidDate = parseDateValue(request.paid_at) || parseDateValue(request.payment_date);
      const amount = calculateFeeRequestTotal(request);
      const rawStatus = `${request.status || ''}`.trim().toLowerCase();
      let statusLabel = rawStatus ? `${rawStatus.charAt(0).toUpperCase()}${rawStatus.slice(1)}` : 'Pending';
      if (rawStatus === 'paid' || rawStatus === 'success') {
        statusLabel = 'Paid';
      } else if (dueDate && dueDate.getTime() < today.getTime()) {
        statusLabel = 'Overdue';
      } else if (!rawStatus) {
        statusLabel = 'Pending';
      }

      const reminderCandidates = [
        ...(request.student_doc_id ? reminderIndex.get(request.student_doc_id) || [] : []),
        ...(request.studentId && request.studentId !== request.student_doc_id
          ? reminderIndex.get(request.studentId) || []
          : []),
      ];
      let hasReminder = false;
      if (reminderCandidates.length) {
        hasReminder = reminderCandidates.some((item) => {
          if (!dueDate || !item?.due) return true;
          const diff = Math.abs(item.due.getTime() - dueDate.getTime());
          return diff <= 1000 * 60 * 60 * 24;
        });
      }

      const paymentModeLabel = normalisePaymentMode(
        request.payment_mode ||
          request.mode ||
          request.transaction_mode ||
          request.paymentMode ||
          request.channel,
      );
      const paymentModeKey = ['Cash', 'Online'].includes(paymentModeLabel)
        ? paymentModeLabel
        : paymentModeLabel
        ? 'Other'
        : 'Unspecified';

      const sessionValue = request.session || studentMatch?.session || '';
      const termValue = request.term || request.billing_term || request.term_label || '';

      const storeAmount = parseAmountValue(request.breakdown?.store?.amount);

      return {
        id: request.id,
        studentId: studentMatch?.studentId || request.studentId || request.student_doc_id || '',
        studentDocId: request.student_doc_id || studentMatch?.id || '',
        studentName: studentMatch?.name || request.student_name || '',
        class: studentMatch?.class || request.class || '',
        section: studentMatch?.section || request.section || '',
        parentEmail: studentMatch?.parent_email || request.parent_email || '',
        parentPhone: studentMatch?.parent_phone || request.parent_phone || '',
        statusLabel,
        rawStatus,
        dueDate,
        paidDate,
        amount,
        balance: rawStatus === 'paid' || rawStatus === 'success' ? 0 : amount,
        cycle: resolveRequestCycle(request),
        session: sessionValue,
        term: termValue,
        paymentModeLabel,
        paymentModeKey,
        transactionId: request.transaction_id || request.payment_reference || request.razorpay_payment_id || '',
        hasReminder,
        storeAmount,
      };
    });
  }, [feeRequests, students, reminders]);

  const filteredReportEntries = useMemo(() => {
    const safeEntries = Array.isArray(feeRequestReportEntries) ? feeRequestReportEntries : [];
    if (!safeEntries || safeEntries.length === 0) {
      return [];
    }
    const dueFromDate = reportFilters.dueFrom ? new Date(`${reportFilters.dueFrom}T00:00:00`) : null;
    const dueToDate = reportFilters.dueTo ? new Date(`${reportFilters.dueTo}T23:59:59`) : null;
    const searchValue = reportFilters.search.trim().toLowerCase();
    const normalizedTerm = reportFilters.term.trim().toLowerCase();

    const filtered = safeEntries.filter((entry) => {
      const matchesClass = reportFilters.class === 'All' || entry.class === reportFilters.class;
      const matchesStatus = reportFilters.status === 'All' || entry.statusLabel === reportFilters.status;
      const cycleFilter = reportFilters.cycle === 'Half-Yearly' ? '6 Months' : reportFilters.cycle;
      const matchesCycle = reportFilters.cycle === 'All' || entry.cycle === cycleFilter;
      const matchesSession = reportFilters.session === 'All' || entry.session === reportFilters.session;
      const matchesTerm =
        normalizedTerm.length === 0 || (entry.term || '').toLowerCase().includes(normalizedTerm);
      const matchesPaymentMode =
        reportFilters.paymentMode === 'All' || entry.paymentModeKey === reportFilters.paymentMode;
      const matchesReminder =
        reportFilters.reminder === 'All' ||
        (reportFilters.reminder === 'Sent' ? entry.hasReminder : !entry.hasReminder);

      let matchesDueFrom = true;
      if (dueFromDate) {
        matchesDueFrom = entry.dueDate ? entry.dueDate >= dueFromDate : false;
      }
      let matchesDueTo = true;
      if (dueToDate) {
        matchesDueTo = entry.dueDate ? entry.dueDate <= dueToDate : false;
      }

      const matchesSearch =
        searchValue.length === 0 ||
        entry.studentName?.toLowerCase().includes(searchValue) ||
        entry.studentId?.toLowerCase().includes(searchValue) ||
        entry.parentEmail?.toLowerCase().includes(searchValue) ||
        entry.parentPhone?.toLowerCase().includes(searchValue) ||
        entry.transactionId?.toLowerCase().includes(searchValue);

      return (
        matchesClass &&
        matchesStatus &&
        matchesCycle &&
        matchesSession &&
        matchesTerm &&
        matchesPaymentMode &&
        matchesReminder &&
        matchesDueFrom &&
        matchesDueTo &&
        matchesSearch
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return a.dueDate - b.dueDate;
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return (a.studentName || '').localeCompare(b.studentName || '');
    });

    return sorted;
  }, [feeRequestReportEntries, reportFilters]);

  const reportFilterSummary = useMemo(() => {
    const parts = [];
    if (reportFilters.class !== 'All') {
      parts.push(`Class ${reportFilters.class}`);
    }
    if (reportFilters.status !== 'All') {
      parts.push(`Status ${reportFilters.status}`);
    }
    if (reportFilters.cycle !== 'All') {
      parts.push(`Cycle ${reportFilters.cycle}`);
    }
    if (reportFilters.session !== 'All') {
      parts.push(`Session ${reportFilters.session}`);
    }
    if (reportFilters.term.trim()) {
      parts.push(`Term contains “${reportFilters.term.trim()}”`);
    }
    if (reportFilters.paymentMode !== 'All') {
      parts.push(`Mode ${reportFilters.paymentMode}`);
    }
    if (reportFilters.reminder !== 'All') {
      parts.push(reportFilters.reminder === 'Sent' ? 'Reminder sent' : 'No reminder');
    }
    if (reportFilters.dueFrom) {
      parts.push(`Due from ${reportFilters.dueFrom}`);
    }
    if (reportFilters.dueTo) {
      parts.push(`Due to ${reportFilters.dueTo}`);
    }
    if (reportFilters.search.trim()) {
      parts.push(`Search “${reportFilters.search.trim()}”`);
    }
    return parts.length ? parts.join(' · ') : 'No filters applied';
  }, [reportFilters]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleReportFilterChange = (event) => {
    const { name, value } = event.target;
    setReportFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleResetReportFilters = () => {
    setReportFilters({ ...REPORT_DEFAULT_FILTERS });
  };

  const openReportModal = () => {
    setIsReportModalOpen(true);
  };

  const closeReportModal = () => {
    setIsReportModalOpen(false);
  };

  const handleDownloadReport = async (format) => {
    if (!['pdf', 'csv'].includes(format)) {
      return;
    }
    if (!filteredReportEntries.length) {
      triggerToast('No records match the selected filters.', 'info');
      return;
    }
    setReportDownloadState({ format, loading: true });
    const summaryText = reportFilterSummary;

    const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    const formatDateDisplay = (date) =>
      date instanceof Date && Number.isFinite(date.getTime())
        ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
    const formatDateIso = (date) =>
      date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString().split('T')[0] : '';

    try {
      if (format === 'csv') {
        const escapeCsvValue = (value) => {
          if (value === null || value === undefined) return '""';
          const stringValue = `${value}`.replace(/"/g, '""');
          return `"${stringValue}"`;
        };

        const lines = [];
        lines.push(escapeCsvValue(SCHOOL_NAME));
        lines.push(`${escapeCsvValue('Generated On')},${escapeCsvValue(new Date().toLocaleString())}`);
        lines.push(`${escapeCsvValue('Filters')},${escapeCsvValue(summaryText)}`);
        lines.push('');

        const header = [
          'Student ID',
          'Student Name',
          'Class',
          'Section',
          'Status',
          'Fee Cycle',
          'Session',
          'Term',
          'Due Date',
          'Amount (₹)',
          'Balance (₹)',
          'Payment Mode',
          'Transaction ID',
          'Parent Email',
          'Parent Phone',
          'Reminder Sent',
          'Store Charge (₹)',
        ];
        lines.push(header.map(escapeCsvValue).join(','));

        filteredReportEntries.forEach((entry) => {
          const row = [
            entry.studentId || '-',
            entry.studentName || '-',
            entry.class || '-',
            entry.section || '-',
            entry.statusLabel || '-',
            entry.cycle || '-',
            entry.session || '-',
            entry.term || '-',
            formatDateIso(entry.dueDate) || '-',
            Number(entry.amount || 0).toFixed(2),
            Number(entry.balance || 0).toFixed(2),
            entry.paymentModeLabel || '-',
            entry.transactionId || '-',
            entry.parentEmail || '-',
            entry.parentPhone || '-',
            entry.hasReminder ? 'Yes' : 'No',
            Number(entry.storeAmount || 0).toFixed(2),
          ];
          lines.push(row.map(escapeCsvValue).join(','));
        });

        const csvContent = lines.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'fee-collection-report.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        doc.setFontSize(15);
        doc.text(SCHOOL_NAME, 14, 20);
        doc.setFontSize(12);
        doc.text('Fee Collection Report', 14, 32);
        doc.setFontSize(9);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 42);
        doc.text(`Filters: ${summaryText}`, 14, 52, { maxWidth: 180 });

        let y = 64;
        filteredReportEntries.forEach((entry, index) => {
          if (y > 270) {
            doc.addPage();
            y = 24;
          }
          doc.setFontSize(11);
          doc.text(`${index + 1}. ${entry.studentName || 'Student'}`, 14, y);
          y += 8;
          doc.setFontSize(9);
          doc.text(`Student ID: ${entry.studentId || '—'}`, 14, y);
          doc.text(`Class: ${entry.class || '—'}${entry.section ? ` · Section ${entry.section}` : ''}`, 100, y);
          y += 10;
          doc.text(`Status: ${entry.statusLabel || '—'} · Cycle: ${entry.cycle || '—'}`, 14, y);
          doc.text(`Session: ${entry.session || '—'} · Term: ${entry.term || '—'}`, 100, y);
          y += 10;
          doc.text(
            `Amount: ${formatCurrency(entry.amount)} · Balance: ${formatCurrency(entry.balance)}`,
            14,
            y,
          );
          doc.text(`Due: ${formatDateDisplay(entry.dueDate)} · Paid: ${formatDateDisplay(entry.paidDate)}`, 100, y);
          y += 10;
          doc.text(
            `Mode: ${entry.paymentModeLabel || '—'} · Txn: ${entry.transactionId || '—'}`,
            14,
            y,
          );
          y += 10;
          doc.text(`Parent: ${entry.parentEmail || '—'} · Phone: ${entry.parentPhone || '—'}`, 14, y);
          y += 10;
          doc.text(
            `Reminder Sent: ${entry.hasReminder ? 'Yes' : 'No'} · Store Charge: ${formatCurrency(entry.storeAmount)}`,
            14,
            y,
          );
          y += 12;
        });

        doc.save('fee-collection-report.pdf');
      }
      triggerToast('Report downloaded successfully.', 'success');
    } catch (error) {
      console.error('Error generating report', error);
      triggerToast('Unable to download report. Please try again.', 'error');
    } finally {
      setReportDownloadState({ format: null, loading: false });
    }
  };

  const StudentFilterControls = () => (
    <div className="grid gap-3 md:grid-cols-5">
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
      <select
        name="sort"
        value={filters.sort}
        onChange={handleFilterChange}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
      >
        <option value="name-asc">Name (A-Z)</option>
        <option value="class-asc">Class</option>
        <option value="balance-desc">Highest Balance</option>
      </select>
    </div>
  );

  const handleOpenAddStudent = () => {
    closeStudentActions();
    resetDeleteContext();
    resetMarkPaidContext();
    setFormState({ ...emptyStudentForm, fee_cycle: 'Monthly' });
    setEditingStudentId(null);
    setIsFormOpen(true);
  };

  const handleEditStudent = (student) => {
    closeStudentActions();
    resetDeleteContext();
    resetMarkPaidContext();
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

  const normaliseCycleId = (value) => {
    if (!value) return 'Monthly';
    const match = REQUEST_CYCLE_OPTIONS.find(
      (option) => option.id === value || option.label.toLowerCase() === `${value}`.toLowerCase(),
    );
    return match ? match.id : 'Monthly';
  };

  const buildFeeRequestForm = (student) => ({
    cycle: normaliseCycleId(student?.fee_cycle),
    dueDate: student?.due_date || feeStructureDraft.defaultDueDate || '',
    customAmount: '',
    customNote: '',
    othersAmount: '',
    othersLabel: '',
    includeStore: false,
    storeItem: '',
    storeAmount: '',
  });

  const handleOpenFeeRequest = (student) => {
    closeStudentActions();
    resetMarkPaidContext();
    setFeeRequestContext({ open: true, student });
    setFeeRequestForm(buildFeeRequestForm(student));
  };

  const handleCloseFeeRequest = () => {
    setFeeRequestContext({ open: false, student: null });
    setFeeRequestForm(buildFeeRequestForm(null));
    setFeeRequestSubmitting(false);
  };

  const handleFeeRequestFieldChange = (name, rawValue) => {
    setFeeRequestForm((prev) => {
      if (name === 'includeStore') {
        const include = Boolean(rawValue);
        return {
          ...prev,
          includeStore: include,
          ...(include
            ? {}
            : {
                storeItem: '',
                storeAmount: '',
              }),
        };
      }
      const isAmountField = ['customAmount', 'othersAmount', 'storeAmount'].includes(name);
      const value = isAmountField ? `${rawValue}`.replace(/[^0-9.]/g, '') : rawValue;
      return { ...prev, [name]: value };
    });
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
        triggerToast('Fee structure missing for the selected class.', 'error');
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

  const handleTransactionFilterChange = (event) => {
    const { name, value } = event.target;
    setTransactionFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleExportTransactions = () => {
    const header = [
      'Date',
      'Time',
      'Student Name',
      'Class',
      'Amount',
      'Mode',
      'Transaction ID',
      'Month',
      'Status',
    ];
    const rows = filteredTransactions.map((entry) => {
      const rawDate = entry.date?.toDate
        ? entry.date.toDate()
        : entry.date
        ? new Date(entry.date)
        : null;
      const hasValidDate = rawDate && Number.isFinite(rawDate.getTime());
      const dateValue = hasValidDate ? rawDate.toLocaleDateString('en-IN') : '';
      const timeValue = hasValidDate ? rawDate.toLocaleTimeString('en-IN') : '';
      return [
        dateValue,
        timeValue,
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
    resetMarkPaidContext();
    closeStudentActions();
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
    closeStudentActions();
    resetMarkPaidContext();
    const historyQuery = query(
      collection(db, 'payments'),
      where('studentId', '==', student.studentId || student.id),
      orderBy('date', 'desc'),
    );
    const historySnapshot = await getDocs(historyQuery);
    const entries = historySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    setHistoryContext({ open: true, student, entries });
  };

  const handleDownloadHistoryReport = async (student, entries) => {
    if (!student) return;
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      const title = `Fee Report · ${student.name || student.studentId || 'Student'}`;
      const studentId = student.studentId || student.id;
      doc.setFontSize(16);
      doc.text(title, 14, 20);
      doc.setFontSize(11);
      doc.text(`Student ID: ${studentId}`, 14, 30);
      doc.text(`Class: ${student.class || '-'}`, 14, 36);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 42);
      let y = 52;
      if (!entries.length) {
        doc.text('No payments recorded yet.', 14, y);
      } else {
        entries.forEach((payment, index) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.setFontSize(12);
          doc.text(`Payment ${index + 1}`, 14, y);
          y += 6;
          doc.setFontSize(11);
          const amountLine = `Amount: ₹${Number(payment.amount || 0).toLocaleString('en-IN')}`;
          const modeLine = `Mode: ${payment.mode || 'Online'}`;
          const dateValue = payment.date?.toDate
            ? payment.date.toDate().toLocaleString()
            : payment.date
            ? new Date(payment.date).toLocaleString()
            : '—';
          doc.text(amountLine, 14, y);
          y += 6;
          doc.text(modeLine, 14, y);
          y += 6;
          doc.text(`Date: ${dateValue}`, 14, y);
          y += 6;
          if (payment.transaction_id) {
            doc.text(`Transaction ID: ${payment.transaction_id}`, 14, y);
            y += 6;
          }
          if (payment.breakdown && Array.isArray(payment.breakdown) && payment.breakdown.length > 0) {
            doc.text('Breakdown:', 14, y);
            y += 6;
            payment.breakdown.forEach((item) => {
              if (y > 270) {
                doc.addPage();
                y = 20;
              }
              doc.text(`• ${item.label || 'Fee'} — ₹${Number(item.amount || 0).toLocaleString('en-IN')}`, 18, y);
              y += 6;
            });
          }
          y += 4;
        });
      }
      const fileSafeId = `${studentId}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      doc.save(`fee-report-${fileSafeId}.pdf`);
      triggerToast('Report downloaded successfully.', 'success');
    } catch (error) {
      console.error('Error generating history PDF', error);
      triggerToast('Unable to download report. Please try again.', 'error');
    }
  };

  const handleFeeRequestSubmit = async (event) => {
    event.preventDefault();
    if (!feeRequestContext.student) return;
    const student = feeRequestContext.student;
    const baseAmount = feeRequestAmounts.base;
    const customAmount = feeRequestAmounts.custom;
    const othersAmount = feeRequestAmounts.others;
    const storeAmount = feeRequestAmounts.store;
    const totalAmount = feeRequestAmounts.total;
    if (totalAmount <= 0) {
      triggerToast('Enter at least one amount before creating a request.', 'error');
      return;
    }
    if (feeRequestForm.includeStore && storeAmount <= 0) {
      triggerToast('Store charges must include an amount.', 'error');
      return;
    }
    const dueDateValue = feeRequestForm.dueDate || feeStructureDraft.defaultDueDate || '';
    const cycleMeta = REQUEST_CYCLE_OPTIONS.find((item) => item.id === feeRequestForm.cycle) || {
      id: feeRequestForm.cycle,
      label: feeRequestForm.cycle,
    };
    setFeeRequestSubmitting(true);
    try {
      const breakdown = {};
      if (baseAmount > 0) {
        breakdown.tuition = {
          label: `${cycleMeta.label} Fee`,
          amount: baseAmount,
          cycle: cycleMeta.label,
        };
      }
      if (customAmount > 0) {
        breakdown.custom = {
          label: feeRequestForm.customNote.trim() || 'Custom Fee',
          amount: customAmount,
          note: feeRequestForm.customNote.trim(),
        };
      }
      if (othersAmount > 0) {
        breakdown.others = {
          label: feeRequestForm.othersLabel.trim() || 'Others',
          amount: othersAmount,
        };
      }
      if (storeAmount > 0) {
        breakdown.store = {
          label: feeRequestForm.storeItem.trim() || 'Store Item',
          amount: storeAmount,
        };
      }

      await addDoc(collection(db, 'fee_requests'), {
        student_doc_id: student.id,
        studentId: student.studentId || student.id,
        student_name: student.name,
        class: student.class || '',
        parent_email: student.parent_email || '',
        parent_uid: student.parent_uid || '',
        fee_cycle: cycleMeta.label,
        cycle: cycleMeta.id,
        base_amount: baseAmount,
        custom_amount: customAmount,
        extras_total: othersAmount + storeAmount,
        amount_total: totalAmount,
        due_date: dueDateValue,
        breakdown,
        status: 'Pending',
        created_at: serverTimestamp(),
      });

      const feeBreakdown = [];
      if (baseAmount > 0) {
        feeBreakdown.push({ label: `${cycleMeta.label} Fee`, amount: baseAmount });
      }
      if (customAmount > 0) {
        feeBreakdown.push({
          label: feeRequestForm.customNote.trim() || 'Custom Fee',
          amount: customAmount,
        });
      }

      const tuitionBalance = baseAmount + customAmount;
      await updateDoc(doc(db, 'students', student.id), {
        fee_cycle: cycleMeta.label,
        fee_amount: tuitionBalance,
        balance: tuitionBalance,
        due_date: dueDateValue,
        fee_breakdown: feeBreakdown,
        status: tuitionBalance > 0 ? 'Pending' : 'Paid',
        updated_at: serverTimestamp(),
      });

      triggerToast('Fee request created successfully.', 'success');
      handleCloseFeeRequest();
    } catch (error) {
      console.error('Error creating fee request', error);
      triggerToast('Unable to create fee request. Please try again.', 'error');
      setFeeRequestSubmitting(false);
    }
  };

  const deleteStudentRecord = async (student) => {
    if (!student) return;
    await deleteDoc(doc(db, 'students', student.id));
    if (student.parent_uid) {
      try {
        await updateDoc(doc(db, 'users', student.parent_uid), {
          children: arrayRemove(student.id),
        });
      } catch (error) {
        console.warn('Unable to update parent record', error);
      }
    }
  };

  const requestDeleteStudent = (student) => {
    if (!student) return;
    closeStudentActions();
    resetMarkPaidContext();
    setDeleteContext({
      open: true,
      student,
      password: '',
      step: 'password',
      submitting: false,
      error: '',
    });
  };

  const handleDeletePasswordChange = (event) => {
    const { value } = event.target;
    setDeleteContext((prev) => ({ ...prev, password: value, error: '' }));
  };

  const verifyDeletePassword = () => {
    if (deleteContext.password.trim() !== SUPER_ADMIN_PASSWORD) {
      setDeleteContext((prev) => ({ ...prev, error: 'Incorrect password. Please try again.' }));
      return;
    }
    setDeleteContext((prev) => ({ ...prev, step: 'confirm', error: '' }));
  };

  const cancelDeleteStudent = () => {
    resetDeleteContext();
  };

  const confirmDeleteStudent = async () => {
    const target = deleteContext.student;
    if (!target) return;
    setDeleteContext((prev) => ({ ...prev, submitting: true, error: '' }));
    try {
      await deleteStudentRecord(target);
      triggerToast('Student removed successfully.', 'success');
      resetDeleteContext();
      if (selectedStudentId === target.id) {
        setSelectedStudentId(null);
      }
    } catch (error) {
      console.error('Error deleting student', error);
      setDeleteContext((prev) => ({ ...prev, submitting: false, error: 'Unable to delete student. Please try again.' }));
      triggerToast('Unable to delete student. Please try again.', 'error');
    }
  };

  const beginMarkPaidFlow = (student) => {
    if (!student) return;
    if ((student.status || '').toLowerCase() === 'paid') {
      triggerToast('Student is already marked as paid.', 'info');
      return;
    }
    closeStudentActions();
    setMarkPaidContext((prev) => {
      if (prev.student?.id === student.id) {
        return { student: null, step: 'mode', mode: null, transactionId: '', submitting: false, error: '' };
      }
      return { student, step: 'mode', mode: null, transactionId: '', submitting: false, error: '' };
    });
  };

  const completeMarkPaid = async (student, mode, transactionId = '') => {
    if (!student) return;
    const normalizedMode = mode === 'Online' ? 'Online' : 'Cash';
    const amountToClear = Number(student.balance ?? student.fee_amount ?? 0);
    if (amountToClear <= 0) {
      triggerToast('No outstanding balance for this student.', 'error');
      resetMarkPaidContext();
      return;
    }
    setMarkPaidContext((prev) => ({ ...prev, submitting: true, error: '' }));
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
        mode: normalizedMode,
        date: serverTimestamp(),
        term: settingsState.currentTerm || '',
        fee_type: 'Manual Adjustment',
        status: 'Success',
        transaction_id: normalizedMode === 'Online' ? transactionId : '',
      });
      const pendingRequestsQuery = query(
        collection(db, 'fee_requests'),
        where('student_doc_id', '==', student.id),
      );
      const pendingRequestsSnapshot = await getDocs(pendingRequestsQuery);
      const requestUpdates = [];
      pendingRequestsSnapshot.forEach((requestDoc) => {
        const requestStatus = (requestDoc.data().status || '').toLowerCase();
        if (requestStatus === 'paid') return;
        requestUpdates.push(
          updateDoc(doc(db, 'fee_requests', requestDoc.id), {
            status: 'Paid',
            paid_at: serverTimestamp(),
            payment_mode: normalizedMode,
            transaction_id: normalizedMode === 'Online' ? transactionId : '',
            updated_at: serverTimestamp(),
          }),
        );
      });
      if (requestUpdates.length > 0) {
        await Promise.all(requestUpdates);
        console.log('[Sync] Updated fee_requests status to Paid', requestUpdates.length);
      }
      await logTransactionEntry({
        student,
        amount: amountToClear,
        mode: normalizedMode,
        transactionId: normalizedMode === 'Online' ? transactionId : '',
        status: 'Paid',
      });
      triggerToast('Payment recorded successfully.', 'success');
      resetMarkPaidContext();
    } catch (error) {
      console.error('Error marking paid', error);
      setMarkPaidContext((prev) => ({ ...prev, submitting: false, error: 'Unable to update record. Please try again.' }));
      triggerToast('Unable to update record.', 'error');
    }
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

  const handleCheckDues = (student) => {
    if (!student) return;
    const safeEntries = Array.isArray(feeRequestReportEntries) ? feeRequestReportEntries : [];
    if (!safeEntries.length) {
      triggerToast('No fee records available yet.', 'info');
      return;
    }

    const normalizeKey = (value) => (value ? `${value}`.trim().toLowerCase() : '');
    const studentKeys = new Set(
      [student.studentId, student.id, student.name, student.student_doc_id]
        .map(normalizeKey)
        .filter(Boolean),
    );

    const matchingEntries = safeEntries.filter((entry) => {
      const entryKeys = [entry.studentId, entry.studentDocId, entry.studentName]
        .map(normalizeKey)
        .filter(Boolean);
      return entryKeys.some((key) => studentKeys.has(key));
    });

    if (!matchingEntries.length) {
      triggerToast(`No fee records found for ${student.name || 'this student'}.`, 'info');
      return;
    }

    let tone = 'success';
    const statusSet = new Set();
    let outstandingAmount = 0;
    matchingEntries.forEach((entry) => {
      const status = entry.statusLabel || 'Pending';
      statusSet.add(status);
      const normalizedStatus = status.toLowerCase();
      if (normalizedStatus === 'overdue') {
        tone = 'error';
      } else if (normalizedStatus === 'pending' && tone !== 'error') {
        tone = 'info';
      }
      const balance = Number(entry.balance || 0);
      if (balance > 0) {
        outstandingAmount += balance;
      }
    });

    const statusList = Array.from(statusSet);
    const parts = [];
    if (outstandingAmount > 0) {
      parts.push(`Outstanding: ₹${outstandingAmount.toLocaleString('en-IN')}`);
    }
    if (statusList.length > 0) {
      parts.push(`Statuses: ${statusList.join(', ')}`);
    }

    if (!parts.length) {
      triggerToast(`All dues cleared for ${student.name || 'this student'}.`, 'success');
      return;
    }

    triggerToast(`${student.name || 'Student'} · ${parts.join(' · ')}`, tone);
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
          <div className="flex items-start gap-3">
            <Image src="/elnode.png" alt="EL-NODE Pay logo" width={48} height={48} priority />
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Accountant Dashboard</h1>
              <p className="text-sm text-slate-600">
                Bird’s-eye view of fee collections and student payments.
              </p>
            </div>
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
              onClick={openReportModal}
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
            { id: 'students', label: 'Students' },
            { id: 'fee-report', label: 'Fee Report' },
            { id: 'transactions', label: 'Transaction Log' },
            { id: 'reminders', label: 'Reminders and Notification' },
            { id: 'fee-settings', label: 'Fee Settings' },
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                <h3 className="text-sm font-medium text-slate-500">Pending Fees</h3>
                <p className="mt-3 text-2xl font-semibold text-amber-600">
                  ₹{monthMetrics.pendingTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="mt-2 text-xs text-slate-500">Pending requests: {monthMetrics.pendingRequestCount}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Overdue Fees</h3>
                <p className="mt-3 text-2xl font-semibold text-rose-600">
                  ₹{monthMetrics.overdueFeesAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="mt-2 text-xs text-slate-500">Overdue requests: {monthMetrics.overdueRequestCount}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Upcoming Due Payments</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{monthMetrics.upcomingCount}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Paid / Unpaid students: {monthMetrics.paidCount}/{monthMetrics.unpaidCount}
                </p>
                <p className="mt-2 text-xs text-slate-500">Across fee request breakdowns</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Total Students Registered</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{monthMetrics.totalStudents}</p>
                <p className="mt-2 text-xs text-slate-500">Overdue students: {monthMetrics.overdueCount}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Active Parents</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{monthMetrics.activeParents}</p>
                <p className="mt-2 text-xs text-slate-500">Parents with open requests</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Average Collection Delay</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">
                  {monthMetrics.averageCollectionDelay != null
                    ? `${monthMetrics.averageCollectionDelay.toFixed(1)} days`
                    : '—'}
                </p>
                <p className="mt-2 text-xs text-slate-500">Based on {paidRequestCount} paid requests</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Reminder Conversion Rate</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">
                  {monthMetrics.reminderConversionRate != null
                    ? `${monthMetrics.reminderConversionRate.toFixed(0)}%`
                    : 'N/A'}
                </p>
                <p className="mt-2 text-xs text-slate-500">Tracked reminders: {monthMetrics.reminderBaseCount}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Store-Charge Revenue</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">
                  ₹{monthMetrics.storeRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="mt-2 text-xs text-slate-500">Across fee request breakdowns</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Total Students Registered</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{monthMetrics.totalStudents}</p>
                <p className="mt-2 text-xs text-slate-500">Overdue students: {monthMetrics.overdueCount}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Active Parents</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{monthMetrics.activeParents}</p>
                <p className="mt-2 text-xs text-slate-500">Parents with open requests</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Monthly Collection Trend</h3>
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
                <h3 className="text-base font-semibold text-slate-900">Paid vs Pending Requests</h3>
                <Pie
                  data={{
                    labels: ['Paid', 'Pending'],
                    datasets: [
                      {
                        data: [paidRequestCount, pendingRequestCount],
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
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Payment Mode Split</h3>
                <Pie
                  data={{
                    labels: ['Online', 'Cash', 'Other'],
                    datasets: [
                      {
                        data: [
                          paymentModeTotals.Online || 0,
                          paymentModeTotals.Cash || 0,
                          paymentModeTotals.Other || 0,
                        ],
                        backgroundColor: ['#2563eb', '#047857', '#f97316'],
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

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Fee Type Distribution</h3>
                <ul className="mt-4 space-y-3 text-sm">
                  {feeTypeDistribution.length === 0 && (
                    <li className="text-slate-500">No fee requests recorded yet.</li>
                  )}
                  {feeTypeDistribution.map((entry) => (
                    <li
                      key={entry.label}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <span className="font-medium text-slate-700">{entry.label}</span>
                      <span className="text-sm font-semibold text-slate-900">{entry.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
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

        {activeTab === 'students' && (
          <section className="mt-8 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Students</h2>
                  <p className="text-sm text-slate-500">
                    View every student, update their details, and raise fee requests in one place.
                  </p>
                </div>
                <StudentFilterControls />
              </div>

              <div className="mt-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredStudents.map((student) => {
                    const isSelected = selectedStudentId === student.id;
                    return (
                      <div
                        key={student.id}
                        className={`relative rounded-3xl border ${
                          isSelected ? 'border-cardinal ring-2 ring-cardinal/20' : 'border-slate-200'
                        } bg-white p-5 shadow-sm transition hover:shadow-md`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            resetMarkPaidContext();
                            setSelectedStudentId(student.id);
                            setStudentActionsContext({ open: true, student });
                          }}
                          className="flex w-full flex-col gap-3 text-left"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-500">{student.studentId || student.id}</p>
                            <h3 className="mt-1 text-lg font-semibold text-slate-900">{student.name}</h3>
                            <p className="text-sm text-slate-500">
                              Class {student.class || '—'}
                              {student.section ? ` · Section ${student.section}` : ''}
                            </p>
                          </div>
                          <div className="space-y-1 text-xs text-slate-500">
                            {student.parent_email && (
                              <p>
                                Email: <span className="font-medium text-slate-700">{student.parent_email}</span>
                              </p>
                            )}
                            {student.parent_phone && (
                              <p>
                                Phone: <span className="font-medium text-slate-700">{student.parent_phone}</span>
                              </p>
                            )}
                          </div>
                        </button>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCheckDues(student);
                            }}
                            className="rounded-full border border-cardinal px-4 py-1.5 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
                          >
                            Fee status
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {filteredStudents.length === 0 && (
                  <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                    {loadingStudents ? 'Loading student records…' : 'No students match the current filters.'}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'fee-report' && (
          <section className="mt-8 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Fee Report</h2>
                  <p className="text-sm text-slate-500">
                    Track pending, paid, and overdue payments. Update records or send reminders instantly.
                  </p>
                </div>
                <StudentFilterControls />
              </div>
              <div className="mt-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredStudents.map((student) => {
                    const balance = Number(student.balance ?? student.fee_amount ?? 0);
                    const total = Number(student.fee_amount ?? 0);
                    const paid = Math.max(total - balance, 0);
                    const isMarking = markPaidContext.student?.id === student.id;
                    const isPaid = (student.status || '').toLowerCase() === 'paid';
                    return (
                      <div
                        key={`${student.id}-fee-report`}
                        className={`rounded-3xl border ${
                          isMarking ? 'border-cardinal ring-2 ring-cardinal/20' : 'border-slate-200'
                        } bg-white p-5 shadow-sm transition hover:shadow-md`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">{student.name}</h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {student.studentId || student.id} · Class {student.class || '—'}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              statusBadgeClasses[student.status] || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {student.status || 'Pending'}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                          <div className="rounded-2xl bg-slate-50 p-3 text-center">
                            <dt className="text-slate-500">Fee</dt>
                            <dd className="mt-1 text-sm font-semibold text-slate-900">
                              ₹{total.toLocaleString('en-IN')}
                            </dd>
                          </div>
                          <div className="rounded-2xl bg-slate-50 p-3 text-center">
                            <dt className="text-slate-500">Paid</dt>
                            <dd className="mt-1 text-sm font-semibold text-emerald-600">
                              ₹{paid.toLocaleString('en-IN')}
                            </dd>
                          </div>
                          <div className="rounded-2xl bg-slate-50 p-3 text-center">
                            <dt className="text-slate-500">Balance</dt>
                            <dd className="mt-1 text-sm font-semibold text-rose-600">
                              ₹{balance.toLocaleString('en-IN')}
                            </dd>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => openHistory(student)}
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-slate-700 transition hover:bg-slate-100"
                          >
                            View History
                          </button>
                          <button
                            type="button"
                            onClick={() => beginMarkPaidFlow(student)}
                            disabled={isPaid || markPaidContext.submitting}
                            className={`rounded-full border px-3 py-1.5 transition ${
                              isPaid
                                ? 'border-slate-200 text-slate-400'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            Mark as Paid
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendReminder(student)}
                            disabled={markPaidContext.submitting}
                            className="rounded-full border border-cardinal px-3 py-1.5 text-cardinal transition hover:bg-cardinal/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Send Reminder
                          </button>
                        </div>
                        {isMarking && (
                          <div className="mt-4 space-y-3 rounded-2xl border border-cardinal bg-cardinal/5 p-4 text-sm text-slate-700">
                            {markPaidContext.step === 'mode' ? (
                              <>
                                <p className="font-semibold text-slate-900">What was the mode of payment?</p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => completeMarkPaid(student, 'Cash')}
                                    disabled={markPaidContext.submitting}
                                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Cash
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMarkPaidContext((prev) => ({
                                        ...prev,
                                        step: 'transaction',
                                        mode: 'Online',
                                        transactionId: '',
                                        error: '',
                                      }))
                                    }
                                    disabled={markPaidContext.submitting}
                                    className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Online
                                  </button>
                                  <button
                                    type="button"
                                    onClick={resetMarkPaidContext}
                                    disabled={markPaidContext.submitting}
                                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="font-semibold text-slate-900">Enter the online transaction ID.</p>
                                <input
                                  value={markPaidContext.transactionId}
                                  onChange={(event) =>
                                    setMarkPaidContext((prev) => ({
                                      ...prev,
                                      transactionId: event.target.value,
                                      error: '',
                                    }))
                                  }
                                  placeholder="Transaction ID"
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                                />
                                {markPaidContext.error && <p className="text-sm text-rose-600">{markPaidContext.error}</p>}
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={resetMarkPaidContext}
                                    disabled={markPaidContext.submitting}
                                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!markPaidContext.transactionId.trim()) {
                                        setMarkPaidContext((prev) => ({ ...prev, error: 'Transaction ID is required.' }));
                                        return;
                                      }
                                      completeMarkPaid(student, 'Online', markPaidContext.transactionId.trim());
                                    }}
                                    disabled={markPaidContext.submitting}
                                    className="rounded-lg bg-cardinal px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Confirm Payment
                                  </button>
                                </div>
                              </>
                            )}
                            {markPaidContext.submitting && (
                              <p className="text-xs text-slate-500">Recording payment…</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {filteredStudents.length === 0 && (
                  <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                    {loadingStudents ? 'Loading fee report…' : 'No students match the current filters.'}
                  </div>
                )}
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
                      <th className="px-4 py-3 text-left">Time</th>
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
                      const rawDate = entry.date?.toDate
                        ? entry.date.toDate()
                        : entry.date
                        ? new Date(entry.date)
                        : null;
                      const hasValidDate = rawDate && Number.isFinite(rawDate.getTime());
                      const dateDisplay = hasValidDate
                        ? rawDate.toLocaleDateString('en-IN')
                        : '—';
                      const timeDisplay = hasValidDate
                        ? rawDate.toLocaleTimeString('en-IN')
                        : '—';
                      return (
                        <tr key={entry.id}>
                          <td className="px-4 py-3 text-slate-600">{dateDisplay}</td>
                          <td className="px-4 py-3 text-slate-600">{timeDisplay}</td>
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
                        <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
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
                <h2 className="text-lg font-semibold text-slate-900">Reminders and Notification</h2>
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

      {isReportModalOpen && (
        <Modal title="Generate Fee Report" onClose={closeReportModal} size="xl">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Class
                <select
                  name="class"
                  value={reportFilters.class}
                  onChange={handleReportFilterChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  <option value="All">All classes</option>
                  {CLASS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Status
                <select
                  name="status"
                  value={reportFilters.status}
                  onChange={handleReportFilterChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  {['All', 'Paid', 'Pending', 'Overdue'].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Fee cycle
                <select
                  name="cycle"
                  value={reportFilters.cycle}
                  onChange={handleReportFilterChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  <option value="All">All cycles</option>
                  {REQUEST_CYCLE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                  <option value="Annual">Annual</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Session
                <select
                  name="session"
                  value={reportFilters.session}
                  onChange={handleReportFilterChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  <option value="All">All sessions</option>
                  {sessionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Payment mode
                <select
                  name="paymentMode"
                  value={reportFilters.paymentMode}
                  onChange={handleReportFilterChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  {['All', 'Cash', 'Online', 'Other', 'Unspecified'].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Reminder status
                <select
                  name="reminder"
                  value={reportFilters.reminder}
                  onChange={handleReportFilterChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  <option value="All">All reminders</option>
                  <option value="Sent">Reminder sent</option>
                  <option value="Not Sent">No reminder</option>
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Due from
                <input
                  type="date"
                  name="dueFrom"
                  value={reportFilters.dueFrom}
                  onChange={handleReportFilterChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Due to
                <input
                  type="date"
                  name="dueTo"
                  value={reportFilters.dueTo}
                  onChange={handleReportFilterChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Term contains
                <input
                  name="term"
                  value={reportFilters.term}
                  onChange={handleReportFilterChange}
                  placeholder="e.g. Term 1"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Search by student, parent, or transaction
                <input
                  name="search"
                  value={reportFilters.search}
                  onChange={handleReportFilterChange}
                  placeholder="Name, email, or transaction ID"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                <p>
                  {filteredReportEntries.length} fee requests match the selected filters.
                </p>
                <p className="mt-1 text-xs text-slate-400">{reportFilterSummary}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetReportFilters}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Reset filters
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadReport('pdf')}
                  disabled={reportDownloadState.loading}
                  className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reportDownloadState.loading && reportDownloadState.format === 'pdf'
                    ? 'Preparing…'
                    : 'download as pdf'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadReport('csv')}
                  disabled={reportDownloadState.loading}
                  className="rounded-xl border border-cardinal px-4 py-2 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reportDownloadState.loading && reportDownloadState.format === 'csv'
                    ? 'Preparing…'
                    : 'download as csv'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

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

      {studentActionsContext.open && (
        <StudentActionsModal
          student={studentActionsContext.student}
          onClose={closeStudentActions}
          onCreateFeeRequest={() =>
            studentActionsContext.student && handleOpenFeeRequest(studentActionsContext.student)
          }
          onViewHistory={() =>
            studentActionsContext.student && openHistory(studentActionsContext.student)
          }
          onEdit={() => studentActionsContext.student && handleEditStudent(studentActionsContext.student)}
          onDelete={() =>
            studentActionsContext.student && requestDeleteStudent(studentActionsContext.student)
          }
        />
      )}

      {deleteContext.open && (
        <DeleteStudentModal
          student={deleteContext.student}
          step={deleteContext.step}
          password={deleteContext.password}
          error={deleteContext.error}
          submitting={deleteContext.submitting}
          onPasswordChange={handleDeletePasswordChange}
          onVerifyPassword={verifyDeletePassword}
          onConfirmDelete={confirmDeleteStudent}
          onCancel={cancelDeleteStudent}
        />
      )}

      {historyContext.open && (
        <PaymentHistoryModal
          student={historyContext.student}
          payments={historyContext.entries}
          onClose={() => setHistoryContext({ open: false, student: null, entries: [] })}
          onDownload={() =>
            handleDownloadHistoryReport(historyContext.student, historyContext.entries)
          }
        />
      )}

      {feeRequestContext.open && (
        <FeeRequestModal
          student={feeRequestContext.student}
          formState={feeRequestForm}
          cycleOptions={REQUEST_CYCLE_OPTIONS}
          amounts={feeRequestAmounts}
          onFieldChange={handleFeeRequestFieldChange}
          onSubmit={handleFeeRequestSubmit}
          onClose={handleCloseFeeRequest}
          isSubmitting={feeRequestSubmitting}
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

export default dynamic(() => Promise.resolve(AccountantDashboard), { ssr: false }); // ssr: false to prevent prerender
