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
  runTransaction,
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
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { auth, db } from '../lib/firebase';
import { getCollectionsInRange, groupByMonth, makeExpenseId, makeVoucherNo } from '../lib/reports';
import { toCSV } from '../lib/csv';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Title,
);

const CLASS_OPTIONS = ['Nursery', 'Kg1', 'Kg2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const SESSION_OPTIONS = ['2023-24', '2024-25', '2025-26', '2026-27', '2027-28'];
const STATUS_OPTIONS = ['All', 'Paid', 'Pending', 'Overdue'];
const REQUEST_CYCLE_OPTIONS = [
  { id: 'Monthly', label: 'Monthly' },
  { id: 'Quarterly', label: 'Quarterly' },
  { id: 'Half-Yearly', label: 'Half-Yearly' },
  { id: 'Annually', label: 'Annually' },
];
const STANDARD_CYCLE_IDS = REQUEST_CYCLE_OPTIONS.map((option) => option.id);
const FEE_NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'students', label: 'Students' },
  { id: 'fee-report', label: 'Fee Report' },
  { id: 'payment-history', label: 'Payment History' },
  { id: 'reminders', label: 'Reminders and Notification' },
];
const FEE_SECTION_TAB_IDS = [...FEE_NAV_ITEMS.map((item) => item.id), 'fee-settings', 'settings', 'house-settings'];
const FINANCE_NAV_ITEMS = [
  { id: 'ledger', label: 'Ledger' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'reports', label: 'Reports' },
];
const FINANCE_TAB_IDS = FINANCE_NAV_ITEMS.map((item) => item.id);

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
    return 'Half-Yearly';
  }
  if (normalised.includes('quarter')) {
    return 'Quarterly';
  }
  if (normalised.includes('month')) {
    return 'Monthly';
  }
  if (normalised.includes('annua') || normalised.includes('year')) {
    return 'Annually';
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

const buildHeadwiseBreakdown = (request = {}) => {
  const breakdown = request.breakdown && typeof request.breakdown === 'object' ? request.breakdown : {};
  const entries = [];
  const pushEntry = (item, fallback) => {
    if (!item && !fallback) return;
    const amount = parseAmountValue(item?.amount);
    if (!(amount > 0)) return;
    entries.push({
      key: fallback,
      label: item?.label || fallback,
      amount,
    });
  };
  pushEntry(breakdown.tuition, request.fee_cycle ? `${request.fee_cycle} Fee` : 'Tuition Fee');
  pushEntry(breakdown.custom, 'Custom Fee');
  pushEntry(breakdown.store, 'Store Charge');
  pushEntry(breakdown.others, 'Other Charge');
  if (!entries.length) {
    const total = calculateFeeRequestTotal(request);
    if (total > 0) {
      entries.push({ key: 'total', label: 'Fee', amount: total });
    }
  }
  return entries;
};

const sanitiseHouseList = (houses = []) => {
  if (!Array.isArray(houses)) return [];
  const seen = new Set();
  const clean = [];
  houses.forEach((house) => {
    const label = `${house || ''}`.trim();
    const key = label.toLowerCase();
    if (label && !seen.has(key)) {
      seen.add(key);
      clean.push(label);
    }
  });
  return clean;
};

const resolveRequestBalance = (request = {}, fallbackAmount = 0) => {
  const explicitFields = [
    request.balance,
    request.outstanding,
    request.remaining_amount,
    request.amount_due,
  ];
  for (const field of explicitFields) {
    const amount = parseAmountValue(field);
    if (amount > 0) {
      return amount;
    }
  }
  const status = `${request.status || ''}`.toLowerCase();
  if (status === 'paid' || status === 'success') {
    return 0;
  }
  return Math.max(parseAmountValue(fallbackAmount), 0);
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

const getFinancialYearRange = (referenceDate = new Date()) => { // fixed initialization order
  const date = new Date(referenceDate);
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  const start = new Date(startYear, 3, 1);
  const end = new Date(endYear, 2, 31, 23, 59, 59, 999);
  return { start, end };
};

const formatDateInput = (date) => { // fixed initialization order
  if (!date) return '';
  const parsed = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatCurrency = (amount) => { // fixed initialization order
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return '₹0';
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const getAdvancePlanEndDate = (student = {}) => {
  if (!student?.advance_plan_end) return null;
  return parseDateValue(student.advance_plan_end);
};

const hasActiveAdvancePlan = (student = {}) => {
  const endDate = getAdvancePlanEndDate(student);
  if (!endDate) return false;
  return endDate.getTime() > Date.now();
};

const buildAdvancePlanNotice = (student = {}) => {
  if (!hasActiveAdvancePlan(student)) {
    return '';
  }
  const endDate = getAdvancePlanEndDate(student);
  if (!endDate) return '';
  const label = student.advance_plan_cycle ||
    (student.advance_plan_months ? `${student.advance_plan_months} months` : 'Advance plan');
  return `${label ? `${label} · ` : ''}Paid till ${endDate.toLocaleDateString('en-IN')}`;
};

const INITIAL_FY_RANGE = getFinancialYearRange(); // fixed initialization order
const DEFAULT_FY_START = formatDateInput(INITIAL_FY_RANGE.start); // fixed initialization order
const DEFAULT_FY_END = formatDateInput(INITIAL_FY_RANGE.end); // fixed initialization order

const resolveCoaFromFeeType = (feeType) => { // fixed initialization order
  switch (feeType) {
    case 'Tuition':
      return 'Tuition Fees';
    case 'Transport':
      return 'Transport Fees';
    case 'Uniform':
      return 'Store Sales';
    case 'Event':
      return 'Donations';
    default:
      return 'Misc Income';
  }
};

const resolveCostCenterFromStudent = (student) => { // fixed initialization order
  if (!student) return 'Admin Office';
  const classValue = Number(student.class || student.class_name || student.className);
  if (Number.isFinite(classValue)) {
    if (classValue <= 5) return 'Junior Wing';
    if (classValue > 5) return 'Senior Wing';
  }
  const section = `${student.section || ''}`.toLowerCase();
  if (section.includes('transport')) return 'Transport';
  return 'Admin Office';
};

const emptyStudentForm = {
  studentId: '',
  name: '',
  class: '',
  section: '',
  parent_phone: '',
  parent_email: '',
  fee_cycle: 'Monthly',
  house: '',
};

const statusBadgeClasses = {
  Paid: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  Pending: 'bg-amber-100 text-amber-700 border border-amber-200',
  Overdue: 'bg-rose-100 text-rose-700 border border-rose-200',
};

const COA_INCOME = [
  'Tuition Fees',
  'Transport Fees',
  'Activity/Lab Fees',
  'Store Sales',
  'Donations',
  'Misc Income',
];

const COA_EXPENSE = [
  'Salaries',
  'Electricity',
  'Printing & Stationery',
  'Repairs & Maintenance',
  'Transport Fuel',
  'IT & Hosting',
  'Misc Expense',
];

const COST_CENTERS = ['Junior Wing', 'Senior Wing', 'Transport', 'Store', 'Admin Office'];

const PAYMENT_MODES = ['Online', 'Cash', 'Card', 'UPI', 'BankTransfer'];

const EXPENSE_CATEGORIES = ['Printing', 'Electricity', 'Repairs', 'Salary', 'TransportFuel', 'Misc'];

const EXPENSE_STATUS_OPTIONS = ['Paid', 'Unpaid', 'PartiallyPaid'];

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

const StudentFormModal = ({
  isEditing,
  formState,
  onChange,
  onSubmit,
  onClose,
  isSubmitting,
  houseOptions = [],
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
          House
          {houseOptions.length > 0 ? (
            <select
              name="house"
              value={formState.house}
              onChange={onChange}
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focu
s:ring-2 focus:ring-cardinal/20"
            >
              <option value="">No house assigned</option>
              {houseOptions.map((house) => (
                <option key={house} value={house}>
                  {house}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="house"
              value={formState.house}
              onChange={onChange}
              placeholder="Add houses from Settings"
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focu
s:ring-2 focus:ring-cardinal/20"
              readOnly
            />
          )}
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
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <input
          id="fee-request-tuition"
          type="checkbox"
          checked={formState.tuitionEnabled}
          onChange={(event) => onFieldChange('tuitionEnabled', event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal"
        />
        <label htmlFor="fee-request-tuition" className="space-y-1 text-sm">
          <span className="block font-semibold text-slate-900">Tuition fees</span>
          <span className="block text-slate-600">
            Toggle this on when the request should include the regular tuition cycle and due date.
          </span>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {formState.tuitionEnabled && (
          <>
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Billing Cycle
              <select
                name="cycle"
                value={formState.cycle}
                onChange={(event) => onFieldChange(event.target.name, event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focu
s:ring-2 focus:ring-cardinal/20"
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
                className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focu
s:ring-2 focus:ring-cardinal/20"
              />
            </label>
          </>
        )}
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Custom Fee (optional)
          <input
            name="customAmount"
            value={formState.customAmount}
            onChange={(event) => onFieldChange(event.target.name, event.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focu
s:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Custom Fee Note
          <input
            name="customNote"
            value={formState.customNote}
            onChange={(event) => onFieldChange(event.target.name, event.target.value)}
            placeholder="Reason for custom amount"
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focu
s:ring-2 focus:ring-cardinal/20"
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
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focu
s:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Others Name (optional)
          <input
            name="othersLabel"
            value={formState.othersLabel}
            onChange={(event) => onFieldChange(event.target.name, event.target.value)}
            placeholder="Lab fee, picnic…"
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focu
s:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Store Charges
          <select
            name="includeStore"
            value={formState.includeStore ? 'yes' : 'no'}
            onChange={(event) => onFieldChange('includeStore', event.target.value === 'yes')}
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focu
s:ring-2 focus:ring-cardinal/20"
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
          {formState.tuitionEnabled && (
            <li className="flex justify-between">
              <span>{cycleOptions.find((item) => item.id === formState.cycle)?.label || 'Tuition'}</span>
              <span>₹{amounts.base.toLocaleString('en-IN')}</span>
            </li>
          )}
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


const CommonFeeRequestModal = ({
  state,
  cycleOptions,
  filteredStudents,
  onCycleChange,
  onDueDateChange,
  onClassFilterChange,
  onSearchChange,
  onToggleStudent,
  onToggleAllFiltered,
  onClearSelection,
  onSubmit,
  onClose,
  isSubmitting,
  resolveAmount,
  resolveAdvanceNotice,
}) => {
  const selectedCount = state.selectedIds instanceof Set ? state.selectedIds.size : 0;
  const advanceResolver = resolveAdvanceNotice || (() => '');
  const eligibleIds = filteredStudents
    .filter((student) => !advanceResolver(student))
    .map((student) => student.id);
  const allEligibleSelected =
    eligibleIds.length > 0 && eligibleIds.every((id) => state.selectedIds.has(id));

  return (
    <Modal title="Create Common Fee Request" onClose={onClose} size="xl">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Billing Cycle
            <select
              value={state.cycle}
              onChange={(event) => onCycleChange(event.target.value)}
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
            Due Date (optional)
            <input
              type="date"
              value={state.dueDate}
              onChange={(event) => onDueDateChange(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </label>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Class Filter
                <select
                  value={state.classFilter}
                  onChange={(event) => onClassFilterChange(event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  <option value="All">All Classes</option>
                  {CLASS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Search Student
                <input
                  value={state.search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Search by name or ID"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => onToggleAllFiltered(eligibleIds)}
                disabled={eligibleIds.length === 0}
                className="rounded-full border border-slate-200 px-3 py-1.5 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {eligibleIds.length === 0
                  ? 'No eligible students'
                  : allEligibleSelected
                  ? 'Deselect eligible'
                  : 'Select eligible'}
              </button>
              <button
                type="button"
                onClick={onClearSelection}
                className="rounded-full border border-slate-200 px-3 py-1.5 transition hover:bg-slate-100"
              >
                Clear all
              </button>
              <span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-slate-600">
                Selected: {selectedCount}
              </span>
            </div>
          </div>
          <div className="mt-4 max-h-80 overflow-y-auto rounded-2xl border border-slate-200">
            <ul className="divide-y divide-slate-200">
              {filteredStudents.map((student) => {
                const amount = resolveAmount(student);
                const checked = state.selectedIds.has(student.id);
                const advanceNotice = advanceResolver(student);
                const disabled = Boolean(advanceNotice);
                return (
                  <li key={student.id}>
                    <label className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleStudent(student.id, disabled)}
                          disabled={disabled}
                          className="h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal"
                        />
                        <span>
                          <p className="font-semibold text-slate-900">{student.name}</p>
                          <p className="text-xs text-slate-500">
                            {student.studentId || student.id} · Class {student.class || '—'}
                          </p>
                          {advanceNotice && (
                            <p className="text-[11px] font-medium text-amber-600">{advanceNotice}</p>
                          )}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        ₹{Number(amount || 0).toLocaleString('en-IN')}
                      </span>
                    </label>
                  </li>
                );
              })}
              {filteredStudents.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-slate-500">
                  No students match the current filters.
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Cycle: <span className="font-semibold text-slate-900">{state.cycle}</span> · Due date:{' '}
            <span className="font-semibold text-slate-900">{state.dueDate || 'Not set'}</span>
          </span>
          <button
            type="submit"
            disabled={isSubmitting || selectedCount === 0}
            className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting
              ? 'Creating requests…'
              : `Create for ${selectedCount} student${selectedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
    </Modal>
  );
};

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
      {payments.map((payment) => {
        const modeLabel = payment.mode || 'Online';
        const isOnline = modeLabel.toLowerCase() === 'online';
        const transactionRef = payment.razorpay_payment_id || payment.transaction_id || '';
        return (
          <div
            key={payment.id}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-semibold text-slate-900">₹{payment.amount?.toLocaleString('en-IN')}</div>
              <span className="text-xs uppercase tracking-wide text-slate-500">{modeLabel}</span>
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
            <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
              <div>
                <p className="font-semibold text-slate-500">Mode of payment</p>
                <p className="text-slate-900">{modeLabel}</p>
              </div>
              {isOnline && (
                <div>
                  <p className="font-semibold text-slate-500">Transaction ID</p>
                  <p className="text-slate-900">{transactionRef || '—'}</p>
                </div>
              )}
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
        );
      })}
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
  const [activeSection, setActiveSection] = useState('fees');
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const settingsMenuRef = useRef(null);
  const headerRef = useRef(null);
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
  const [paymentModeFilter, setPaymentModeFilter] = useState('All');
  const [clearingDemoData, setClearingDemoData] = useState(false);
  const [settingsState, setSettingsState] = useState({
    currentTerm: '',
    defaultDueDate: '',
    reminderTemplate: '',
    houses: [],
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [feeStructure, setFeeStructure] = useState({ session: '', defaultDueDate: '', fees: {} });
  const [feeStructureDraft, setFeeStructureDraft] = useState({ session: '', defaultDueDate: '', fees: {} });
  const [feeStructureSaving, setFeeStructureSaving] = useState(false);
  const [feeRequestContext, setFeeRequestContext] = useState({ open: false, student: null });
  const [feeRequestForm, setFeeRequestForm] = useState({
    tuitionEnabled: true,
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
  const [feeReportDetailContext, setFeeReportDetailContext] = useState({ open: false, student: null });
  const [commonRequestContext, setCommonRequestContext] = useState({ open: false, submitting: false });
  const [commonRequestState, setCommonRequestState] = useState(() => ({
    cycle: 'Monthly',
    dueDate: '',
    classFilter: 'All',
    search: '',
    selectedIds: new Set(),
  }));
  const [transactionsLog, setTransactionsLog] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [ledgerFilters, setLedgerFilters] = useState({
    startDate: DEFAULT_FY_START,
    endDate: DEFAULT_FY_END,
    feeType: 'All',
    paymentMode: 'All',
    coa: 'All',
    costCenter: 'All',
    className: 'All',
    search: '',
  });
  const [manualEntryModalOpen, setManualEntryModalOpen] = useState(false);
  const [manualEntrySubmitting, setManualEntrySubmitting] = useState(false);
  const [newHouseName, setNewHouseName] = useState('');
  const [houseSettingsSaving, setHouseSettingsSaving] = useState(false);

  const houseOptions = useMemo(
    () => sanitiseHouseList(settingsState.houses || []),
    [settingsState.houses],
  );
  const [manualEntryForm, setManualEntryForm] = useState(() => ({
    date: formatDateInput(new Date()),
    studentId: '',
    feeType: 'Tuition',
    coa: COA_INCOME[0],
    costCenter: COST_CENTERS[0],
    amount: '',
    paymentMode: 'Cash',
    notes: '',
  }));
  const [expenseForm, setExpenseForm] = useState(() => ({
    date: formatDateInput(new Date()),
    vendor: '',
    category: EXPENSE_CATEGORIES[0],
    amount: '',
    paymentMode: 'Cash',
    coa: COA_EXPENSE[0],
    costCenter: COST_CENTERS[0],
    invoiceNo: '',
    narration: '',
    status: EXPENSE_STATUS_OPTIONS[0],
  }));
  const [expenseAttachmentFile, setExpenseAttachmentFile] = useState(null);
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [expenseFilters, setExpenseFilters] = useState({
    startDate: DEFAULT_FY_START,
    endDate: DEFAULT_FY_END,
    category: 'All',
    vendor: '',
    costCenter: 'All',
    status: 'All',
  });
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [reportRanges, setReportRanges] = useState({
    collectionStart: DEFAULT_FY_START,
    collectionEnd: DEFAULT_FY_END,
    outstandingStart: DEFAULT_FY_START,
    outstandingEnd: DEFAULT_FY_END,
    expenseStart: DEFAULT_FY_START,
    expenseEnd: DEFAULT_FY_END,
    cashFlowStart: DEFAULT_FY_START,
    cashFlowEnd: DEFAULT_FY_END,
  });
  const [reportsLoading, setReportsLoading] = useState({
    collections: false,
    outstanding: false,
    expenses: false,
    cashflow: false,
  });
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
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
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

  const handleConfirmSignOut = useCallback(() => {
    setSignOutConfirmOpen(false);
    handleSignOut();
  }, [handleSignOut]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setIsSettingsMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsSettingsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

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
        annual: entry.annual ?? '',
      };
    });
    return {
      session: data?.session || '',
      defaultDueDate: data?.defaultDueDate || '',
      fees: formattedFees,
    };
  };

  const getFeeAmountFromStructure = useCallback(
    (className, cycle) => {
      if (!className) return 0;
      const entry = feeStructureDraft.fees?.[className] || {};
      const monthly = Number(entry.monthly || 0);
      const quarterly = Number(entry.quarterly || 0);
      const halfYearly = Number(entry.halfYearly || 0);
      const annual = Number(entry.annual || 0);
      switch (cycle) {
        case 'Monthly':
          return monthly;
        case 'Quarterly':
          return quarterly;
        case 'Half-Yearly':
          if (halfYearly) return halfYearly;
          if (quarterly) return quarterly * 2;
          return monthly * 6;
        case 'Annually':
          if (annual) return annual;
          if (halfYearly) return halfYearly * 2;
          if (quarterly) return quarterly * 4;
          return monthly * 12;
        default:
          return 0;
      }
    },
    [feeStructureDraft],
  );

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

  const logTransactionEntry = async ({
    student,
    amount,
    mode,
    transactionId,
    status,
    feeType,
    notes,
    orderId,
    coa,
    costCenter,
    recordedBy,
    date,
  }) => {
    const safeStudent = student || {
      id: 'misc-income',
      studentId: 'misc-income',
      name: 'Misc Income',
      class: '',
      section: '',
      parent_email: '',
      parent_phone: '',
    };
    const entryDate = date ? new Date(date) : new Date();
    if (!Number.isFinite(entryDate.getTime())) {
      throw new Error('Invalid date provided for transaction log entry');
    }
    const voucherNo = await makeVoucherNo(db, runTransaction, entryDate);
    const resolvedFeeType = feeType || 'Tuition';
    const resolvedCoa = coa || resolveCoaFromFeeType(resolvedFeeType);
    const resolvedCostCenter = costCenter || resolveCostCenterFromStudent(safeStudent);
    const paymentMode = mode || 'Online';
    const isoDate = entryDate.toISOString();
    const monthLabel = entryDate.toLocaleString('en-IN', { month: 'long' });
    const metadata = getMonthMeta(entryDate);
    try {
      await addDoc(collection(db, 'transactions_log'), {
        transaction_id: transactionId || 'manual',
        order_id: orderId || null,
        voucher_no: voucherNo,
        student_doc_id: safeStudent.id,
        student_id: safeStudent.studentId || safeStudent.id,
        student_name: safeStudent.name || 'Misc Income',
        class_name: safeStudent.class || safeStudent.class_name || '',
        section: safeStudent.section || '',
        parent_email: safeStudent.parent_email || '',
        parent_phone: safeStudent.parent_phone || '',
        amount: Number(amount || 0),
        fee_type: resolvedFeeType,
        coa: resolvedCoa,
        cost_center: resolvedCostCenter,
        payment_mode: paymentMode,
        status: status || 'Paid',
        date: isoDate,
        month: monthLabel,
        month_key: metadata.key,
        month_label: metadata.label,
        recorded_by: recordedBy || user?.email || user?.uid || 'system',
        notes: notes || '',
        created_at: serverTimestamp(),
      });
    } catch (error) {
      console.error('Unable to record transaction log', error);
      throw error;
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
    if (FINANCE_TAB_IDS.includes(activeTab)) {
      setActiveSection('finances');
    } else {
      setActiveSection('fees');
    }
  }, [activeTab]);

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
          houses: sanitiseHouseList(data.houses || []),
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

    const expensesQueryRef = query(collection(db, 'expenses'), orderBy('date', 'desc'));
    const unsubscribeExpenses = onSnapshot(
      expensesQueryRef,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setExpenses(data);
        setLoadingExpenses(false);
      },
      () => setLoadingExpenses(false),
    );

    return () => {
      unsubscribeStudents();
      unsubscribePayments();
      unsubscribeReminders();
      unsubscribeFeeRequests();
      unsubscribeSettings();
      unsubscribeFeeStructure();
      unsubscribeTransactions();
      unsubscribeExpenses();
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

  const activeFeeRequests = useMemo(() => {
    const safeFeeRequests = Array.isArray(feeRequests) ? feeRequests : [];
    const activeRequests = safeFeeRequests.filter(
      (r) => r && r.status !== 'Paid' && Number(r.balance ?? r.amount_total ?? 0) > 0,
    );
    return activeRequests;
  }, [feeRequests]);

  const monthMetrics = useMemo(() => {
    const safeTransactions = Array.isArray(transactionsLog) ? transactionsLog : [];
    const safeReminders = Array.isArray(reminders) ? reminders : [];
    const safeFeeRequests = Array.isArray(feeRequests) ? feeRequests : [];
    const safeStudents = Array.isArray(students) ? students : [];
    const safePayments = Array.isArray(payments) ? payments : [];
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const { start: fyStart, end: fyEnd } = getFinancialYearRange(now);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    today.setHours(0, 0, 0, 0);
    const upcomingThreshold = new Date(today);
    upcomingThreshold.setDate(upcomingThreshold.getDate() + 7);
    upcomingThreshold.setHours(23, 59, 59, 999);

    let monthTotal = 0;
    let yearTotal = 0;
    let fyCollectionTotal = 0;
    let fyExpenseTotal = 0;

    const monthlyMap = new Map();
    const expenseMonthlyMap = new Map();
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
      if (entryDate >= fyStart && entryDate <= fyEnd) {
        fyCollectionTotal += amount;
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

    safeExpenses.forEach((expense) => {
      const entryDate = parseDateValue(expense.date);
      if (!entryDate) return;
      const amount = parseAmountValue(expense.amount);
      if (entryDate >= fyStart && entryDate <= fyEnd) {
        fyExpenseTotal += amount;
      }
      const monthKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = entryDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
      const monthExisting = expenseMonthlyMap.get(monthKey) || { label: monthLabel, amount: 0 };
      expenseMonthlyMap.set(monthKey, {
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
      const outstanding = resolveRequestBalance(request, total);
      const dueDate = parseDateValue(request.due_date);
      const cycleKey = resolveRequestCycle(request);
      feeTypeMap.set(cycleKey, (feeTypeMap.get(cycleKey) || 0) + 1);

      if (request.breakdown?.store) {
        storeRevenue += parseAmountValue(request.breakdown.store.amount);
      }

      if (status === 'paid' || outstanding <= 0) {
        paidRequests += 1;
      } else {
        pendingRequests += 1;
      }

      if (outstanding > 0) {
        pendingFees.amount += outstanding;
        pendingFees.count += 1;
        if (dueDate && dueDate.getTime() < todayTime) {
          overdueFees.amount += outstanding;
          overdueFees.count += 1;
        } else if (dueDate && dueDate >= today && dueDate <= upcomingThreshold) {
          upcomingDueCount += 1;
        }
      }

      if (outstanding > 0 && request.parent_email) {
        activeParentEmails.add(request.parent_email);
      }

      if (outstanding <= 0 && dueDate) {
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

    const combinedMonthKeys = Array.from(
      new Set([...monthlyMap.keys(), ...expenseMonthlyMap.keys()]),
    ).sort((a, b) => (a > b ? 1 : -1));
    const cashFlowLabels = combinedMonthKeys.map((key) => {
      const incomeEntry = monthlyMap.get(key);
      const expenseEntry = expenseMonthlyMap.get(key);
      return incomeEntry?.label || expenseEntry?.label || key;
    });
    const cashFlowInflow = combinedMonthKeys.map((key) => monthlyMap.get(key)?.amount || 0);
    const cashFlowOutflow = combinedMonthKeys.map((key) => expenseMonthlyMap.get(key)?.amount || 0);
    const cashFlowNet = cashFlowInflow.map((value, index) => value - cashFlowOutflow[index]);

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
      fyCollectionTotal,
      fyExpenseTotal,
      fyNet: fyCollectionTotal - fyExpenseTotal,
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
      cashFlowLabels,
      cashFlowInflow,
      cashFlowOutflow,
      cashFlowNet,
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
  }, [transactionsLog, feeRequests, reminders, students, payments, expenses]);

  const sessionOptions = useMemo(() => {
    if (!feeStructureDraft.session || SESSION_OPTIONS.includes(feeStructureDraft.session)) {
      return SESSION_OPTIONS;
    }
    return [...SESSION_OPTIONS, feeStructureDraft.session];
  }, [feeStructureDraft.session]);

  const ledgerEntriesView = useMemo(() => {
    const safeEntries = Array.isArray(transactionsLog) ? transactionsLog : [];
    if (!safeEntries.length) return [];
    const start = ledgerFilters.startDate ? new Date(ledgerFilters.startDate) : null;
    const end = ledgerFilters.endDate ? new Date(ledgerFilters.endDate) : null;
    if (start && Number.isFinite(start.getTime())) {
      start.setHours(0, 0, 0, 0);
    }
    if (end && Number.isFinite(end.getTime())) {
      end.setHours(23, 59, 59, 999);
    }
    const searchValue = ledgerFilters.search.trim().toLowerCase();
    return safeEntries
      .map((entry) => {
        const parsedDate = parseDateValue(entry.date) || parseDateValue(entry.created_at);
        return { ...entry, parsedDate };
      })
      .filter((entry) => {
        if (start && entry.parsedDate && entry.parsedDate < start) {
          return false;
        }
        if (end && entry.parsedDate && entry.parsedDate > end) {
          return false;
        }
        if (ledgerFilters.feeType !== 'All') {
          if ((entry.fee_type || '').toLowerCase() !== ledgerFilters.feeType.toLowerCase()) {
            return false;
          }
        }
        if (ledgerFilters.paymentMode !== 'All') {
          const modeValue = entry.payment_mode || entry.mode || 'Online';
          if (`${modeValue}`.toLowerCase() !== ledgerFilters.paymentMode.toLowerCase()) {
            return false;
          }
        }
        if (ledgerFilters.coa !== 'All') {
          if ((entry.coa || '').toLowerCase() !== ledgerFilters.coa.toLowerCase()) {
            return false;
          }
        }
        if (ledgerFilters.costCenter !== 'All') {
          if ((entry.cost_center || '').toLowerCase() !== ledgerFilters.costCenter.toLowerCase()) {
            return false;
          }
        }
        if (ledgerFilters.className !== 'All') {
          const classValue = entry.class_name || entry.class || '';
          if (`${classValue}` !== ledgerFilters.className) {
            return false;
          }
        }
        if (searchValue) {
          const searchable = [
            entry.student_name,
            entry.parent_email,
            entry.voucher_no,
            entry.transaction_id,
            entry.notes,
          ]
            .filter(Boolean)
            .map((value) => `${value}`.toLowerCase());
          const matchesSearch = searchable.some((value) => value.includes(searchValue));
          if (!matchesSearch) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = a.parsedDate ? a.parsedDate.getTime() : 0;
        const dateB = b.parsedDate ? b.parsedDate.getTime() : 0;
        return dateB - dateA;
      });
  }, [transactionsLog, ledgerFilters]);

  const ledgerTotalAmount = useMemo(
    () =>
      ledgerEntriesView.reduce((sum, entry) => {
        const value = parseAmountValue(entry.amount);
        return sum + value;
      }, 0),
    [ledgerEntriesView],
  );

  const expenseEntriesView = useMemo(() => {
    const safeEntries = Array.isArray(expenses) ? expenses : [];
    if (!safeEntries.length) return [];
    const start = expenseFilters.startDate ? new Date(expenseFilters.startDate) : null;
    const end = expenseFilters.endDate ? new Date(expenseFilters.endDate) : null;
    if (start && Number.isFinite(start.getTime())) {
      start.setHours(0, 0, 0, 0);
    }
    if (end && Number.isFinite(end.getTime())) {
      end.setHours(23, 59, 59, 999);
    }
    const vendorSearch = expenseFilters.vendor.trim().toLowerCase();
    return safeEntries
      .map((entry) => ({ ...entry, parsedDate: parseDateValue(entry.date) }))
      .filter((entry) => {
        if (start && entry.parsedDate && entry.parsedDate < start) {
          return false;
        }
        if (end && entry.parsedDate && entry.parsedDate > end) {
          return false;
        }
        if (expenseFilters.category !== 'All') {
          if ((entry.category || '').toLowerCase() !== expenseFilters.category.toLowerCase()) {
            return false;
          }
        }
        if (expenseFilters.costCenter !== 'All') {
          if ((entry.cost_center || '').toLowerCase() !== expenseFilters.costCenter.toLowerCase()) {
            return false;
          }
        }
        if (expenseFilters.status !== 'All') {
          if ((entry.status || '').toLowerCase() !== expenseFilters.status.toLowerCase()) {
            return false;
          }
        }
        if (vendorSearch) {
          const vendorValue = `${entry.vendor || ''}`.toLowerCase();
          if (!vendorValue.includes(vendorSearch)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = a.parsedDate ? a.parsedDate.getTime() : 0;
        const dateB = b.parsedDate ? b.parsedDate.getTime() : 0;
        return dateB - dateA;
      });
  }, [expenses, expenseFilters]);

  const expenseTotalAmount = useMemo(
    () =>
      expenseEntriesView.reduce((sum, entry) => {
        const value = parseAmountValue(entry.amount);
        return sum + value;
      }, 0),
    [expenseEntriesView],
  );

  const paidRequestCount = monthMetrics.requestStatusCounts?.paid || 0;
  const pendingRequestCount = monthMetrics.requestStatusCounts?.pending || 0;
  const paymentModeTotals = monthMetrics.paymentModeSplit || { Cash: 0, Online: 0, Other: 0 };
  const feeTypeDistribution = monthMetrics.feeTypeDistribution || [];

  const feeRequestAmounts = useMemo(() => {
    const student = feeRequestContext.student;
    if (!student) {
      return { base: 0, custom: 0, others: 0, store: 0, total: 0 };
    }
    const base = feeRequestForm.tuitionEnabled
      ? getFeeAmountFromStructure(student.class, feeRequestForm.cycle)
      : 0;
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
  }, [feeRequestContext.student, feeRequestForm, getFeeAmountFromStructure]);

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

  const commonFilteredStudents = useMemo(() => {
    const safeStudents = Array.isArray(students) ? students : [];
    if (!safeStudents || safeStudents.length === 0) {
      return [];
    }
    const classFilter = commonRequestState.classFilter;
    const searchValue = commonRequestState.search.trim().toLowerCase();
    return safeStudents
      .filter((student) => classFilter === 'All' || student.class === classFilter)
      .filter((student) => {
        if (!searchValue) {
          return true;
        }
        const nameMatch = student.name?.toLowerCase().includes(searchValue);
        const idMatch = student.studentId?.toLowerCase().includes(searchValue);
        return Boolean(nameMatch || idMatch);
      })
      .sort((a, b) => {
        const classCompare = (a.class || '').localeCompare(b.class || '');
        if (classCompare !== 0) {
          return classCompare;
        }
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [students, commonRequestState.classFilter, commonRequestState.search]);

  const paymentModeOptions = useMemo(() => {
    const safePayments = Array.isArray(payments) ? payments : [];
    const normalizeLabel = (value) => {
      if (!value) return '';
      const trimmed = value.trim().toLowerCase();
      if (!trimmed) return '';
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    };
    const orderedModes = new Set(['Online', 'Cash']);
    safePayments.forEach((payment) => {
      const label = normalizeLabel(payment.mode || 'Online');
      if (label) {
        orderedModes.add(label);
      }
    });
    return ['All', ...Array.from(orderedModes)];
  }, [payments]);

  const filteredPaymentsByMode = useMemo(() => {
    const safePayments = Array.isArray(payments) ? payments : [];
    if (paymentModeFilter === 'All') {
      return safePayments;
    }
    const normalizedFilter = paymentModeFilter.toLowerCase();
    return safePayments.filter(
      (payment) => (payment.mode || 'Online').toLowerCase() === normalizedFilter,
    );
  }, [payments, paymentModeFilter]);

  const feeRequestReportEntries = useMemo(() => {
    const safeFeeRequests = Array.isArray(activeFeeRequests) ? activeFeeRequests : [];
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
      const outstanding = resolveRequestBalance(request, amount);
      const rawStatus = `${request.status || ''}`.trim().toLowerCase();
      let statusLabel = rawStatus ? `${rawStatus.charAt(0).toUpperCase()}${rawStatus.slice(1)}` : 'Pending';
      if (rawStatus === 'paid' || rawStatus === 'success' || outstanding <= 0) {
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

      const keyCandidates = [
        request.student_doc_id,
        request.studentId,
        request.student_id,
        request.studentID,
        studentMatch?.id,
        studentMatch?.studentId,
        request.student_name,
        studentMatch?.name,
      ];
      const lookupKeys = Array.from(
        new Set(
          keyCandidates
            .map((value) => (value ? `${value}` : ''))
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
        ),
      );

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
        balance: Math.max(outstanding, 0),
        cycle: resolveRequestCycle(request),
        session: sessionValue,
        term: termValue,
        paymentModeLabel,
        paymentModeKey,
        transactionId: request.transaction_id || request.payment_reference || request.razorpay_payment_id || '',
        hasReminder,
        storeAmount,
        tuitionEnabled: Boolean(request.tuition_enabled),
        lookupKeys,
        headBreakdown: buildHeadwiseBreakdown(request),
      };
    });
  }, [activeFeeRequests, students, reminders]);

  const feeRequestEntriesLookup = useMemo(() => {
    const safeEntries = Array.isArray(feeRequestReportEntries) ? feeRequestReportEntries : [];
    const map = new Map();
    safeEntries.forEach((entry) => {
      const keys = Array.isArray(entry.lookupKeys) ? entry.lookupKeys : [];
      keys.forEach((key) => {
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key).push(entry);
      });
    });
    return map;
  }, [feeRequestReportEntries]);

  const feeReportEntriesByStudent = useMemo(() => {
    const safeEntries = Array.isArray(feeRequestReportEntries) ? feeRequestReportEntries : [];
    const map = new Map();
    safeEntries.forEach((entry) => {
      if (!entry.studentDocId) return;
      if (!map.has(entry.studentDocId)) {
        map.set(entry.studentDocId, []);
      }
      map.get(entry.studentDocId).push(entry);
    });
    return map;
  }, [feeRequestReportEntries]);

  const feeReportDetailEntries = useMemo(() => {
    if (!feeReportDetailContext.student) {
      return [];
    }
    return feeReportEntriesByStudent.get(feeReportDetailContext.student.id) || [];
  }, [feeReportDetailContext.student, feeReportEntriesByStudent]);

  const feeReportDetailBalance = useMemo(
    () => feeReportDetailEntries.reduce((sum, entry) => sum + parseAmountValue(entry.balance), 0),
    [feeReportDetailEntries],
  );

  const feeReportDetailHeadSummary = useMemo(() => {
    if (!feeReportDetailEntries.length) {
      return [];
    }
    const summaryMap = new Map();
    feeReportDetailEntries.forEach((entry) => {
      const breakdown = Array.isArray(entry.headBreakdown) ? entry.headBreakdown : [];
      breakdown.forEach((item) => {
        const key = item.key || item.label || 'Fee';
        const amount = parseAmountValue(item.amount);
        if (!(amount > 0)) return;
        if (!summaryMap.has(key)) {
          summaryMap.set(key, { key, label: item.label || key, amount: 0 });
        }
        summaryMap.get(key).amount += amount;
      });
    });
    return Array.from(summaryMap.values());
  }, [feeReportDetailEntries]);

  const feeReportDetailEntriesSorted = useMemo(() => {
    if (!feeReportDetailEntries.length) {
      return [];
    }
    return [...feeReportDetailEntries].sort((a, b) => {
      const aTime = a.dueDate ? a.dueDate.getTime() : 0;
      const bTime = b.dueDate ? b.dueDate.getTime() : 0;
      if (aTime === bTime) {
        return (a.studentId || '').localeCompare(b.studentId || '');
      }
      return aTime - bTime;
    });
  }, [feeReportDetailEntries]);

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
      let matchesCycle = true;
      if (reportFilters.cycle === 'Other') {
        matchesCycle = !STANDARD_CYCLE_IDS.includes(entry.cycle);
      } else if (reportFilters.cycle !== 'All') {
        matchesCycle = entry.cycle === reportFilters.cycle;
      }
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

  const handleOpenStudentActions = (student) => {
    if (!student) return;
    resetMarkPaidContext();
    setSelectedStudentId(student.id);
    setStudentActionsContext({ open: true, student });
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
      house: student.house || '',
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

  const buildFeeRequestForm = (student) => {
    const cycle = normaliseCycleId(student?.fee_cycle);
    const inferredTuition = Boolean(
      student?.fee_cycle ||
        student?.due_date ||
        getFeeAmountFromStructure(student?.class, cycle) > 0,
    );
    return {
      tuitionEnabled: inferredTuition,
      cycle,
      dueDate: student?.due_date || feeStructureDraft.defaultDueDate || '',
      customAmount: '',
      customNote: '',
      othersAmount: '',
      othersLabel: '',
      includeStore: false,
      storeItem: '',
      storeAmount: '',
  };
};

  const buildCommonRequestState = () => ({
    cycle: 'Monthly',
    dueDate: feeStructureDraft.defaultDueDate || '',
    classFilter: 'All',
    search: '',
    selectedIds: new Set(),
  });

  const handleOpenFeeRequest = (student) => {
    closeStudentActions();
    resetMarkPaidContext();
    if (hasActiveAdvancePlan(student)) {
      const notice = buildAdvancePlanNotice(student) || 'Advance fees already recorded for this student.';
      triggerToast(notice, 'warning');
      return;
    }
    setFeeRequestContext({ open: true, student });
    setFeeRequestForm(buildFeeRequestForm(student));
  };

  const handleCloseFeeRequest = () => {
    setFeeRequestContext({ open: false, student: null });
    setFeeRequestForm(buildFeeRequestForm(null));
    setFeeRequestSubmitting(false);
  };

  const handleOpenCommonRequest = () => {
    closeStudentActions();
    resetMarkPaidContext();
    setCommonRequestState(buildCommonRequestState());
    setCommonRequestContext({ open: true, submitting: false });
  };

  const handleCloseCommonRequest = () => {
    setCommonRequestContext({ open: false, submitting: false });
    setCommonRequestState(buildCommonRequestState());
  };

  const handleFeeRequestFieldChange = (name, rawValue) => {
    setFeeRequestForm((prev) => {
      if (name === 'tuitionEnabled') {
        const enable = Boolean(rawValue);
        const defaultCycle = normaliseCycleId(
          feeRequestContext.student?.fee_cycle || prev.cycle || 'Monthly',
        );
        const defaultDueDate =
          feeRequestContext.student?.due_date || feeStructureDraft.defaultDueDate || '';
        return {
          ...prev,
          tuitionEnabled: enable,
          cycle: enable ? defaultCycle : prev.cycle,
          dueDate: enable ? prev.dueDate || defaultDueDate : '',
        };
      }
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

  const handleCommonCycleChange = (value) => {
    setCommonRequestState((prev) => ({ ...prev, cycle: normaliseCycleId(value) }));
  };

  const handleCommonDueDateChange = (value) => {
    setCommonRequestState((prev) => ({ ...prev, dueDate: value }));
  };

  const handleCommonClassFilterChange = (value) => {
    setCommonRequestState((prev) => ({ ...prev, classFilter: value }));
  };

  const handleCommonSearchChange = (value) => {
    setCommonRequestState((prev) => ({ ...prev, search: value }));
  };

  const handleCommonToggleStudent = (studentId, isBlocked = false) => {
    if (isBlocked) {
      triggerToast('Advance fees already paid for this student.', 'warning');
      return;
    }
    setCommonRequestState((prev) => {
      const next = new Set(prev.selectedIds);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return { ...prev, selectedIds: next };
    });
  };

  const handleCommonToggleAllFiltered = (eligibleIds = null) => {
    setCommonRequestState((prev) => {
      const next = new Set(prev.selectedIds);
      const targetIds = Array.isArray(eligibleIds) && eligibleIds.length > 0
        ? eligibleIds
        : commonFilteredStudents.map((student) => student.id);
      if (!targetIds.length) {
        return { ...prev, selectedIds: next };
      }
      const allSelected = targetIds.every((id) => next.has(id));
      if (allSelected) {
        targetIds.forEach((id) => next.delete(id));
      } else {
        targetIds.forEach((id) => next.add(id));
      }
      return { ...prev, selectedIds: next };
    });
  };

  const handleCommonClearSelection = () => {
    setCommonRequestState((prev) => ({ ...prev, selectedIds: new Set() }));
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
        house: formState.house || '',
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
        const annual = Number(entry.annual || halfYearly * 2 || quarterly * 4 || monthly * 12);
        payload.fees[cls] = {
          monthly,
          quarterly,
          halfYearly,
          annual,
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
    const outstandingAmount = Number(student.balance ?? student.fee_amount ?? 0);
    if ((student.status || '').toLowerCase() === 'paid' || outstandingAmount <= 0) {
      if (!silent) {
        triggerToast('No outstanding balance for this student.', 'info');
      }
      return;
    }
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

  const handleDetailViewHistory = async () => {
    if (!feeReportDetailContext.student) return;
    const student = feeReportDetailContext.student;
    closeFeeReportDetail();
    await openHistory(student);
  };

  const handleDetailSendReminder = () => {
    if (!feeReportDetailContext.student) return;
    handleSendReminder(feeReportDetailContext.student);
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
    const includeTuition = Boolean(feeRequestForm.tuitionEnabled);
    const baseAmount = includeTuition ? feeRequestAmounts.base : 0;
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
    const dueDateValue = includeTuition
      ? feeRequestForm.dueDate || feeStructureDraft.defaultDueDate || ''
      : '';
    const cycleMeta = includeTuition
      ? REQUEST_CYCLE_OPTIONS.find((item) => item.id === feeRequestForm.cycle) || {
          id: feeRequestForm.cycle,
          label: feeRequestForm.cycle,
        }
      : { id: feeRequestForm.cycle || 'Adhoc', label: feeRequestForm.cycle || 'Adhoc' };
    const statusValue = totalAmount > 0 ? 'Pending' : 'Paid';
    const timestamp = serverTimestamp();
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
        fee_cycle: includeTuition ? cycleMeta.label : '',
        cycle: includeTuition ? cycleMeta.id : '',
        base_amount: baseAmount,
        custom_amount: customAmount,
        extras_total: othersAmount + storeAmount,
        amount_total: totalAmount,
        due_date: dueDateValue,
        breakdown,
        balance: totalAmount,
        status: statusValue,
        tuition_enabled: includeTuition,
        created_at: timestamp,
        ...(statusValue === 'Paid' ? { paid_at: timestamp } : {}),
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

      const studentUpdates = {
        balance: totalAmount,
        status: statusValue,
        updated_at: serverTimestamp(),
      };
      if (includeTuition) {
        studentUpdates.fee_cycle = cycleMeta.label;
        studentUpdates.fee_amount = baseAmount + customAmount;
        studentUpdates.due_date = dueDateValue;
        studentUpdates.fee_breakdown = feeBreakdown;
      }

      await updateDoc(doc(db, 'students', student.id), studentUpdates);

      triggerToast('Fee request created successfully.', 'success');
      handleCloseFeeRequest();
    } catch (error) {
      console.error('Error creating fee request', error);
      triggerToast('Unable to create fee request. Please try again.', 'error');
      setFeeRequestSubmitting(false);
    }
  };

  const handleCommonRequestSubmit = async (event) => {
    event.preventDefault();
    const selectedIds = Array.from(commonRequestState.selectedIds);
    if (!selectedIds.length) {
      triggerToast('Select at least one student before creating a request.', 'error');
      return;
    }
    setCommonRequestContext((prev) => ({ ...prev, submitting: true }));
    try {
      const cycleMeta =
        REQUEST_CYCLE_OPTIONS.find((item) => item.id === commonRequestState.cycle) || {
          id: commonRequestState.cycle,
          label: commonRequestState.cycle,
        };
      const dueDateValue = commonRequestState.dueDate || feeStructureDraft.defaultDueDate || '';
      let createdCount = 0;
      let skippedCount = 0;
      let advanceSkipped = 0;
      const safeStudents = Array.isArray(students) ? students : [];
      for (const studentId of selectedIds) {
        const student = safeStudents.find((item) => item.id === studentId);
        if (!student) {
          skippedCount += 1;
          continue;
        }
        if (hasActiveAdvancePlan(student)) {
          advanceSkipped += 1;
          continue;
        }
        const baseAmount = getFeeAmountFromStructure(student.class, cycleMeta.id);
        if (!(baseAmount > 0)) {
          skippedCount += 1;
          continue;
        }
        const timestamp = serverTimestamp();
        const breakdown = {
          tuition: {
            label: `${cycleMeta.label} Fee`,
            amount: baseAmount,
            cycle: cycleMeta.label,
          },
        };
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
          custom_amount: 0,
          extras_total: 0,
          amount_total: baseAmount,
          due_date: dueDateValue,
          breakdown,
          balance: baseAmount,
          status: 'Pending',
          tuition_enabled: true,
          created_at: timestamp,
        });
        await updateDoc(doc(db, 'students', student.id), {
          fee_cycle: cycleMeta.label,
          fee_amount: baseAmount,
          balance: baseAmount,
          due_date: dueDateValue,
          fee_breakdown: [{ label: `${cycleMeta.label} Fee`, amount: baseAmount }],
          status: baseAmount > 0 ? 'Pending' : 'Paid',
          updated_at: timestamp,
        });
        createdCount += 1;
      }
      if (createdCount > 0) {
        const parts = [`Created ${createdCount} request${createdCount === 1 ? '' : 's'}`];
        if (skippedCount > 0) {
          parts.push(`Skipped ${skippedCount} without fee data`);
        }
        if (advanceSkipped > 0) {
          parts.push(`Skipped ${advanceSkipped} with advance fees`);
        }
        triggerToast(parts.join(' · '), 'success');
      } else {
        triggerToast('No requests created. Check the fee structure for the selected students.', 'warning');
      }
      setCommonRequestContext({ open: false, submitting: false });
      setCommonRequestState(buildCommonRequestState());
    } catch (error) {
      console.error('Error creating common requests', error);
      setCommonRequestContext((prev) => ({ ...prev, submitting: false }));
      triggerToast('Unable to create common fee requests. Please try again.', 'error');
    }
  };

  const handleClearPaymentData = async () => {
    if (clearingDemoData) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'This will permanently delete all payment history and fee requests. Continue?',
      );
      if (!confirmed) {
        return;
      }
    }
    setClearingDemoData(true);
    const deleteCollectionDocs = async (collectionName) => {
      const snapshot = await getDocs(collection(db, collectionName));
      if (!snapshot.size) return 0;
      await Promise.all(
        snapshot.docs.map((docSnap) => deleteDoc(doc(db, collectionName, docSnap.id))),
      );
      return snapshot.size;
    };
    try {
      const [paymentsDeleted, requestsDeleted] = await Promise.all([
        deleteCollectionDocs('payments'),
        deleteCollectionDocs('fee_requests'),
      ]);
      const parts = [];
      parts.push(`${paymentsDeleted} payment${paymentsDeleted === 1 ? '' : 's'}`);
      parts.push(`${requestsDeleted} request${requestsDeleted === 1 ? '' : 's'}`);
      triggerToast(`Cleared ${parts.join(' & ')}.`, 'success');
    } catch (error) {
      console.error('Error clearing payment data', error);
      triggerToast('Unable to clear payment data. Please try again.', 'error');
    } finally {
      setClearingDemoData(false);
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
            balance: 0,
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
        feeType: 'Tuition',
        notes: 'Marked as paid from fee report',
      });
      triggerToast('Payment recorded successfully.', 'success');
      resetMarkPaidContext();
    } catch (error) {
      console.error('Error marking paid', error);
      setMarkPaidContext((prev) => ({ ...prev, submitting: false, error: 'Unable to update record. Please try again.' }));
      triggerToast('Unable to update record.', 'error');
    }
  };

  const handleMarkPaidModeSelect = (mode) => {
    setMarkPaidContext((prev) => ({ ...prev, mode, error: '' }));
  };

  const handleMarkPaidTransactionChange = (event) => {
    const { value } = event.target;
    setMarkPaidContext((prev) => ({ ...prev, transactionId: value, error: '' }));
  };

  const handleSubmitMarkPaidFromDetail = () => {
    if (!markPaidContext.student) {
      setMarkPaidContext((prev) => ({ ...prev, error: 'Select a student before recording payment.' }));
      return;
    }
    if (!markPaidContext.mode) {
      setMarkPaidContext((prev) => ({ ...prev, error: 'Choose a payment mode to continue.' }));
      return;
    }
    if (markPaidContext.mode === 'Online' && !markPaidContext.transactionId.trim()) {
      setMarkPaidContext((prev) => ({ ...prev, error: 'Enter the online transaction reference.' }));
      return;
    }
    completeMarkPaid(
      markPaidContext.student,
      markPaidContext.mode,
      markPaidContext.transactionId.trim(),
    );
  };

  const handleSettingsChange = (event) => {
    const { name, value } = event.target;
    setSettingsState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSettingsSave = async (event) => {
    event.preventDefault();
    setSavingSettings(true);
    try {
      const houses = sanitiseHouseList(settingsState.houses || []);
      await setDoc(
        doc(db, 'settings', 'general'),
        {
          currentTerm: settingsState.currentTerm,
          defaultDueDate: settingsState.defaultDueDate,
          reminderTemplate: settingsState.reminderTemplate,
          houses,
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

  const handleHouseNameChange = (index, value) => {
    setSettingsState((prev) => {
      const current = Array.isArray(prev.houses) ? [...prev.houses] : [];
      current[index] = value;
      return { ...prev, houses: current };
    });
  };

  const handleRemoveHouse = (index) => {
    setSettingsState((prev) => {
      const current = Array.isArray(prev.houses) ? [...prev.houses] : [];
      current.splice(index, 1);
      return { ...prev, houses: current };
    });
  };

  const handleAddHouseName = () => {
    const trimmed = newHouseName.trim();
    if (!trimmed) return;
    setSettingsState((prev) => {
      const current = Array.isArray(prev.houses) ? [...prev.houses] : [];
      current.push(trimmed);
      return { ...prev, houses: current };
    });
    setNewHouseName('');
  };

  const handleHouseSettingsSave = async (event) => {
    event.preventDefault();
    setHouseSettingsSaving(true);
    try {
      const houses = sanitiseHouseList(settingsState.houses || []);
      await setDoc(
        doc(db, 'settings', 'general'),
        { houses, updated_at: serverTimestamp() },
        { merge: true },
      );
      triggerToast('Houses updated successfully.', 'success');
    } catch (error) {
      console.error('House settings error', error);
      triggerToast('Unable to update houses. Please try again.', 'error');
    } finally {
      setHouseSettingsSaving(false);
    }
  };

  const handleSectionChange = (sectionId) => {
    if (sectionId === 'finances') {
      setActiveSection('finances');
      if (!FINANCE_TAB_IDS.includes(activeTab)) {
        setActiveTab('ledger');
      }
    } else {
      setActiveSection('fees');
      if (!FEE_SECTION_TAB_IDS.includes(activeTab)) {
        setActiveTab('overview');
      }
    }
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  };

  useEffect(() => {
    if (activeSection !== 'finances') {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    if (!headerRef.current) {
      return;
    }
    const { top } = headerRef.current.getBoundingClientRect();
    if (top < 0 || top > 16) {
      headerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeSection]);

  const handleSettingsNavigate = useCallback(
    (tabId) => {
      setActiveTab(tabId);
      setActiveSection('fees');
      setIsSettingsMenuOpen(false);
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          const section = document.getElementById(tabId);
          if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      }
    },
    [],
  );

  const resetManualEntryForm = () => {
    setManualEntryForm({
      date: formatDateInput(new Date()),
      studentId: '',
      feeType: 'Tuition',
      coa: COA_INCOME[0],
      costCenter: COST_CENTERS[0],
      amount: '',
      paymentMode: 'Cash',
      notes: '',
    });
  };

  const handleOpenManualEntryModal = () => {
    resetManualEntryForm();
    setManualEntryModalOpen(true);
  };

  const handleManualEntryFieldChange = (event) => {
    const { name, value } = event.target;
    setManualEntryForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleManualEntrySave = async (event) => {
    event.preventDefault();
    if (manualEntrySubmitting) return;
    const amountValue = parseAmountValue(manualEntryForm.amount);
    if (amountValue <= 0) {
      triggerToast('Enter a valid amount for the ledger entry.', 'error');
      return;
    }
    setManualEntrySubmitting(true);
    try {
      const selectedStudent = manualEntryForm.studentId
        ? students.find((student) => student.id === manualEntryForm.studentId)
        : null;
      await logTransactionEntry({
        student: selectedStudent || null,
        amount: amountValue,
        mode: manualEntryForm.paymentMode,
        transactionId: manualEntryForm.paymentMode === 'Online' ? 'manual-entry' : 'manual',
        status: 'Paid',
        feeType: manualEntryForm.feeType,
        notes: manualEntryForm.notes,
        coa: manualEntryForm.coa,
        costCenter: manualEntryForm.costCenter,
        recordedBy: user?.email || user?.uid || 'system',
        date: manualEntryForm.date,
      });
      triggerToast('Ledger entry recorded successfully.');
      setManualEntryModalOpen(false);
      resetManualEntryForm();
    } catch (error) {
      console.error('Manual ledger entry error', error);
      triggerToast('Unable to save ledger entry. Please try again.', 'error');
    } finally {
      setManualEntrySubmitting(false);
    }
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      date: formatDateInput(new Date()),
      vendor: '',
      category: EXPENSE_CATEGORIES[0],
      amount: '',
      paymentMode: 'Cash',
      coa: COA_EXPENSE[0],
      costCenter: COST_CENTERS[0],
      invoiceNo: '',
      narration: '',
      status: EXPENSE_STATUS_OPTIONS[0],
    });
    setExpenseAttachmentFile(null);
  };

  const handleExpenseFieldChange = (event) => {
    const { name, value } = event.target;
    setExpenseForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleExpenseAttachmentChange = (event) => {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    setExpenseAttachmentFile(file);
  };

  const handleExpenseSubmit = async (event) => {
    event.preventDefault();
    if (expenseSubmitting) return;
    const amountValue = parseAmountValue(expenseForm.amount);
    if (amountValue <= 0) {
      triggerToast('Enter a valid expense amount.', 'error');
      return;
    }
    if (!expenseForm.vendor.trim()) {
      triggerToast('Vendor name is required.', 'error');
      return;
    }
    setExpenseSubmitting(true);
    try {
      const entryDate = expenseForm.date ? new Date(expenseForm.date) : new Date();
      if (!Number.isFinite(entryDate.getTime())) {
        throw new Error('Invalid expense date');
      }
      const expenseId = await makeExpenseId(db, runTransaction, entryDate);
      let attachments = [];
      if (expenseAttachmentFile) {
        const storage = getStorage();
        const fileRef = storageRef(storage, `expenses/${expenseId}/${expenseAttachmentFile.name}`);
        const uploadSnapshot = await uploadBytes(fileRef, expenseAttachmentFile);
        const url = await getDownloadURL(uploadSnapshot.ref);
        attachments = [url];
      }
      await addDoc(collection(db, 'expenses'), {
        expense_id: expenseId,
        date: entryDate.toISOString(),
        vendor: expenseForm.vendor,
        category: expenseForm.category,
        amount: amountValue,
        payment_mode: expenseForm.paymentMode,
        coa: expenseForm.coa,
        cost_center: expenseForm.costCenter,
        invoice_no: expenseForm.invoiceNo || null,
        narration: expenseForm.narration || '',
        status: expenseForm.status,
        uploaded_by: user?.email || user?.uid || 'system',
        attachments,
        created_at: serverTimestamp(),
      });
      triggerToast('Expense recorded successfully.');
      resetExpenseForm();
    } catch (error) {
      console.error('Expense submission error', error);
      triggerToast('Unable to save expense. Please try again.', 'error');
    } finally {
      setExpenseSubmitting(false);
    }
  };

  const handleLedgerFilterChange = (field) => (event) => {
    const value = event?.target ? event.target.value : event;
    setLedgerFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleExpenseFilterChange = (field) => (event) => {
    const value = event?.target ? event.target.value : event;
    setExpenseFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleExpenseRowClick = (entry) => {
    setSelectedExpense(entry);
  };

  const handleCloseExpenseDetail = () => {
    setSelectedExpense(null);
  };

  const handleReportsRangeChange = (field) => (event) => {
    const value = event?.target ? event.target.value : event;
    setReportRanges((prev) => ({ ...prev, [field]: value }));
  };

  const downloadCsvFile = (filename, rows) => {
    if (!rows || rows.length === 0) {
      triggerToast('No data available for download.', 'info');
      return;
    }
    const csvContent = toCSV(rows);
    if (!csvContent) {
      triggerToast('Unable to generate CSV content.', 'error');
      return;
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerToast('Report downloaded successfully.', 'success');
  };

  const handleDownloadMonthlyCollections = async () => {
    setReportsLoading((prev) => ({ ...prev, collections: true }));
    try {
      const { collectionStart, collectionEnd } = reportRanges;
      const rows = await getCollectionsInRange(db, 'transactions_log', 'date', collectionStart, collectionEnd);
      const paidRows = rows.filter((row) => `${row.status || ''}`.toLowerCase() === 'paid');
      const grouped = groupByMonth(paidRows, 'date');
      const csvRows = Array.from(grouped.values()).map((entry) => ({
        Month: entry.label,
        Transactions: entry.items.length,
        TotalAmount: entry.total,
      }));
      downloadCsvFile('monthly-collection-summary.csv', csvRows);
    } catch (error) {
      console.error('Monthly collection export error', error);
      triggerToast('Unable to download monthly collection summary.', 'error');
    } finally {
      setReportsLoading((prev) => ({ ...prev, collections: false }));
    }
  };

  const handleDownloadOutstanding = async () => {
    setReportsLoading((prev) => ({ ...prev, outstanding: true }));
    try {
      const { outstandingStart, outstandingEnd } = reportRanges;
      const start = outstandingStart ? new Date(outstandingStart) : null;
      const end = outstandingEnd ? new Date(outstandingEnd) : null;
      if (start && Number.isFinite(start.getTime())) {
        start.setHours(0, 0, 0, 0);
      }
      if (end && Number.isFinite(end.getTime())) {
        end.setHours(23, 59, 59, 999);
      }
      const safeRequests = Array.isArray(feeRequests) ? feeRequests : [];
      const filtered = safeRequests.filter((request) => {
        const status = `${request.status || ''}`.toLowerCase();
        if (status === 'paid' || status === 'success') return false;
        const dueDate =
          parseDateValue(request.due_date) ||
          parseDateValue(request.dueDate) ||
          parseDateValue(request.due_on) ||
          null;
        if (start && dueDate && dueDate < start) {
          return false;
        }
        if (end && dueDate && dueDate > end) {
          return false;
        }
        return true;
      });
      const csvRows = filtered.map((request) => ({
        Student: request.student_name || request.studentName || request.student_id || '',
        Class: request.class || request.class_name || '',
        DueDate: (parseDateValue(request.due_date) || parseDateValue(request.dueDate))?.toISOString() || '',
        Amount: parseAmountValue(request.amount || request.amount_total || request.balance || 0),
        Balance: parseAmountValue(request.balance || request.amount_due || request.amount || 0),
        Status: request.status || 'Pending',
      }));
      downloadCsvFile('outstanding-fees.csv', csvRows);
    } catch (error) {
      console.error('Outstanding report export error', error);
      triggerToast('Unable to download outstanding fee report.', 'error');
    } finally {
      setReportsLoading((prev) => ({ ...prev, outstanding: false }));
    }
  };

  const handleDownloadExpensesLedger = async () => {
    setReportsLoading((prev) => ({ ...prev, expenses: true }));
    try {
      const { expenseStart, expenseEnd } = reportRanges;
      const rows = await getCollectionsInRange(db, 'expenses', 'date', expenseStart, expenseEnd);
      const csvRows = rows.map((entry) => ({
        Date: entry.date,
        ExpenseID: entry.expense_id,
        Vendor: entry.vendor,
        Category: entry.category,
        COA: entry.coa,
        CostCenter: entry.cost_center,
        Amount: parseAmountValue(entry.amount),
        PaymentMode: entry.payment_mode,
        Status: entry.status,
      }));
      downloadCsvFile('expenses-ledger.csv', csvRows);
    } catch (error) {
      console.error('Expense ledger export error', error);
      triggerToast('Unable to download expenses ledger.', 'error');
    } finally {
      setReportsLoading((prev) => ({ ...prev, expenses: false }));
    }
  };

  const handleDownloadCashflow = async () => {
    setReportsLoading((prev) => ({ ...prev, cashflow: true }));
    try {
      const { cashFlowStart, cashFlowEnd } = reportRanges;
      const [collections, expenseRows] = await Promise.all([
        getCollectionsInRange(db, 'transactions_log', 'date', cashFlowStart, cashFlowEnd),
        getCollectionsInRange(db, 'expenses', 'date', cashFlowStart, cashFlowEnd),
      ]);
      const paidCollections = collections.filter((entry) => `${entry.status || ''}`.toLowerCase() === 'paid');
      const incomeGrouped = groupByMonth(paidCollections, 'date');
      const expenseGrouped = groupByMonth(expenseRows, 'date');
      const monthKeys = new Set([...incomeGrouped.keys(), ...expenseGrouped.keys()]);
      const csvRows = Array.from(monthKeys)
        .sort((a, b) => (a > b ? 1 : -1))
        .map((key) => {
          const incomeEntry = incomeGrouped.get(key);
          const expenseEntry = expenseGrouped.get(key);
          const inflow = incomeEntry ? incomeEntry.total : 0;
          const outflow = expenseEntry ? expenseEntry.total : 0;
          return {
            Month: incomeEntry?.label || expenseEntry?.label || key,
            Inflow: inflow,
            Outflow: outflow,
            Net: inflow - outflow,
          };
        });
      downloadCsvFile('cashflow-statement.csv', csvRows);
    } catch (error) {
      console.error('Cashflow export error', error);
      triggerToast('Unable to download cash flow statement.', 'error');
    } finally {
      setReportsLoading((prev) => ({ ...prev, cashflow: false }));
    }
  };

  const openFeeReportDetail = (student) => {
    if (!student) return;
    resetMarkPaidContext();
    setFeeReportDetailContext({ open: true, student });
  };

  const closeFeeReportDetail = () => {
    setFeeReportDetailContext({ open: false, student: null });
    resetMarkPaidContext();
    setSelectedStudentId(null);
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

  const isFinanceSection = activeSection === 'finances';

  return (
    <div className="min-h-screen bg-slate-50">
      <Head>
        <title>Accountant Dashboard · EL-NODE Pay</title>
      </Head>
      <header
        ref={headerRef}
        className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"
      >
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
          <div
            className={`flex flex-wrap items-center gap-3 ${
              isFinanceSection ? 'justify-end md:justify-end' : ''
            }`}
          >
            {!isFinanceSection && (
              <>
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
                <div className="relative" ref={settingsMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsSettingsMenuOpen((prev) => !prev)}
                    className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    aria-haspopup="true"
                    aria-expanded={isSettingsMenuOpen}
                    aria-controls="settings-menu"
                  >
                    Settings
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`h-4 w-4 transition-transform ${isSettingsMenuOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.218 8.29a.75.75 0 01.02-1.08z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  {isSettingsMenuOpen && (
                    <div
                      id="settings-menu"
                      className="absolute right-0 z-10 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                      role="menu"
                      aria-label="Settings"
                    >
                      {[
                        { id: 'fee-settings', label: 'Fee Settings' },
                        { id: 'settings', label: 'Automation Settings' },
                        { id: 'house-settings', label: 'House Settings' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSettingsNavigate(item.id)}
                          className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-cardinal/10"
                          role="menuitem"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClearPaymentData}
                  disabled={clearingDemoData}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {clearingDemoData ? 'Clearing…' : 'Clear Payment Data'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setSignOutConfirmOpen(true)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>


      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap gap-3">
          {[
            { id: 'fees', label: 'Fees' },
            { id: 'finances', label: 'Finances' },
          ].map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => handleSectionChange(section.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeSection === section.id
                  ? 'bg-cardinal text-white shadow'
                  : 'bg-white text-slate-600 shadow-sm hover:bg-cardinal/10'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
        <nav className="mt-4 flex flex-wrap gap-3">
          {(activeSection === 'finances' ? FINANCE_NAV_ITEMS : FEE_NAV_ITEMS).map((tab) => (
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Total Collected (FY)</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{formatCurrency(monthMetrics.fyCollectionTotal)}</p>
                <p className="mt-2 text-xs text-slate-500">Financial year inflow</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Pending Fees</h3>
                <p className="mt-3 text-2xl font-semibold text-amber-600">{formatCurrency(monthMetrics.pendingTotal)}</p>
                <p className="mt-2 text-xs text-slate-500">Requests: {monthMetrics.pendingRequestCount}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Overdue Fees</h3>
                <p className="mt-3 text-2xl font-semibold text-rose-600">{formatCurrency(monthMetrics.overdueFeesAmount)}</p>
                <p className="mt-2 text-xs text-slate-500">Requests: {monthMetrics.overdueRequestCount}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Expenses (FY)</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{formatCurrency(monthMetrics.fyExpenseTotal)}</p>
                <p className="mt-2 text-xs text-slate-500">Includes all logged expenses</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Net Inflow (FY)</h3>
                <p
                  className={`mt-3 text-2xl font-semibold ${
                    monthMetrics.fyNet >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {formatCurrency(monthMetrics.fyNet)}
                </p>
                <p className="mt-2 text-xs text-slate-500">Collections minus expenses</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Fees Collected (This Month)</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">
                  ₹{monthMetrics.monthTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Calendar year: ₹{monthMetrics.yearTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500">Upcoming Due Payments</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{monthMetrics.upcomingCount}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Paid / Unpaid students: {monthMetrics.paidCount}/{monthMetrics.unpaidCount}
                </p>
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

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
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
                <h3 className="text-base font-semibold text-slate-900">Cash Flow (Monthly)</h3>
                <Line
                  data={{
                    labels: monthMetrics.cashFlowLabels,
                    datasets: [
                      {
                        label: 'Inflow',
                        data: monthMetrics.cashFlowInflow,
                        borderColor: '#047857',
                        backgroundColor: 'rgba(4, 120, 87, 0.2)',
                        tension: 0.3,
                      },
                      {
                        label: 'Outflow',
                        data: monthMetrics.cashFlowOutflow,
                        borderColor: '#dc2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.2)',
                        tension: 0.3,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { position: 'bottom' },
                    },
                    interaction: { intersect: false, mode: 'index' },
                    scales: {
                      y: {
                        ticks: {
                          callback: (value) => `₹${Number(value).toLocaleString('en-IN')}`,
                        },
                      },
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

        {activeSection === 'fees' && activeTab === 'students' && (
          <section className="mt-8 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Students</h2>
                  <p className="text-sm text-slate-500">
                    View every student, update their details, and raise fee requests in one place.
                  </p>
                </div>
                <div className="space-y-3 md:w-1/2 xl:w-2/5">
                  <StudentFilterControls />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleOpenCommonRequest}
                      className="rounded-full border border-cardinal px-4 py-2 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10"
                    >
                      Create Common Fee Request
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredStudents.map((student) => {
                    const advanceNotice = buildAdvancePlanNotice(student);
                    const isSelected = selectedStudentId === student.id;
                    const statusLabel = student.status || 'Pending';
                    return (
                      <div
                        key={student.id}
                        className={`rounded-3xl border ${
                          isSelected ? 'border-cardinal ring-2 ring-cardinal/20' : 'border-slate-200'
                        } bg-white p-5 shadow-sm transition hover:shadow-md`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-500">{student.studentId || student.id}</p>
                            <h3 className="mt-1 text-lg font-semibold text-slate-900">{student.name}</h3>
                            <p className="text-sm text-slate-500">
                              Class {student.class || '—'}
                              {student.section ? ` · Section ${student.section}` : ''}
                            </p>
                            {student.house && (
                              <p className="text-xs text-slate-500">
                                House: <span className="font-medium text-slate-700">{student.house}</span>
                              </p>
                            )}
                            {advanceNotice && (
                              <p className="text-xs font-semibold text-emerald-600">{advanceNotice}</p>
                            )}
                          </div>
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              statusBadgeClasses[statusLabel] || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleOpenStudentActions(student)}
                            className="rounded-full border border-cardinal px-4 py-2 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
                          >
                            Manage
                          </button>
                          <button
                            type="button"
                            onClick={() => openHistory(student)}
                            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                          >
                            View History
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
                    const hasOutstanding = balance > 0;
                    const statusLabel = hasOutstanding ? student.status || 'Pending' : 'Paid';
                    const advanceNotice = buildAdvancePlanNotice(student);
                    const isDetailOpen =
                      feeReportDetailContext.open && feeReportDetailContext.student?.id === student.id;
                    const studentRequestEntries = feeReportEntriesByStudent.get(student.id) || [];
                    const requestCount = studentRequestEntries.length;
                    const outstandingRequests = studentRequestEntries.filter(
                      (entry) => entry.statusLabel !== 'Paid',
                    ).length;
                    const latestDueDate = studentRequestEntries
                      .map((entry) => entry.dueDate)
                      .filter(Boolean)
                      .sort((a, b) => a - b)[0];
                    return (
                      <button
                        type="button"
                        key={`${student.id}-fee-report`}
                        onClick={() => openFeeReportDetail(student)}
                        className={`text-left rounded-3xl border ${
                          isDetailOpen ? 'border-cardinal ring-2 ring-cardinal/20' : 'border-slate-200'
                        } bg-white p-5 shadow-sm transition hover:shadow-md`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-500">{student.studentId || student.id}</p>
                            <h3 className="mt-1 text-lg font-semibold text-slate-900">{student.name}</h3>
                            <p className="text-sm text-slate-500">
                              Class {student.class || '—'}
                              {student.section ? ` · Section ${student.section}` : ''}
                            </p>
                            {student.house && (
                              <p className="text-xs text-slate-500">
                                House: <span className="font-medium text-slate-700">{student.house}</span>
                              </p>
                            )}
                            {advanceNotice && (
                              <p className="text-xs font-semibold text-emerald-600">{advanceNotice}</p>
                            )}
                          </div>
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              statusBadgeClasses[statusLabel] || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Outstanding balance</span>
                            <span>
                              {requestCount > 0
                                ? `${outstandingRequests}/${requestCount} requests pending`
                                : 'No fee requests yet'}
                            </span>
                          </div>
                          <p
                            className={`mt-1 text-2xl font-semibold ${
                              hasOutstanding ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            ₹{balance.toLocaleString('en-IN')}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {latestDueDate
                              ? `Next due: ${latestDueDate.toLocaleDateString('en-IN')}`
                              : 'Tap to view head-wise details.'}
                          </p>
                        </div>
                      </button>
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
                    <p className="mt-1">Half-yearly and annual dues are auto-calculated when left blank.</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Class</th>
                        <th className="px-4 py-3 text-left">Monthly Fee (₹)</th>
                        <th className="px-4 py-3 text-left">Quarterly Fee (₹)</th>
                        <th className="px-4 py-3 text-left">Half-Yearly Fee (₹)</th>
                        <th className="px-4 py-3 text-left">Annual Fee (₹)</th>
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
                          <td className="px-4 py-3">
                            <input
                              value={feeStructureDraft.fees?.[item]?.halfYearly ?? ''}
                              onChange={(event) => handleFeeValueChange(item, 'halfYearly', event.target.value)}
                              placeholder="0"
                              inputMode="decimal"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              value={feeStructureDraft.fees?.[item]?.annual ?? ''}
                              onChange={(event) => handleFeeValueChange(item, 'annual', event.target.value)}
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

        {activeTab === 'ledger' && (
          <section id="ledger" className="mt-8 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Financial Ledger</h2>
                  <p className="text-sm text-slate-500">
                    Track all receipts across fee types, cost centers, and modes.
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    Total in view: {formatCurrency(ledgerTotalAmount)} · Entries: {ledgerEntriesView.length}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleOpenManualEntryModal}
                    className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90"
                  >
                    Add Manual Entry
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  From Date
                  <input
                    type="date"
                    value={ledgerFilters.startDate}
                    onChange={handleLedgerFilterChange('startDate')}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  To Date
                  <input
                    type="date"
                    value={ledgerFilters.endDate}
                    onChange={handleLedgerFilterChange('endDate')}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Fee Type
                  <select
                    value={ledgerFilters.feeType}
                    onChange={handleLedgerFilterChange('feeType')}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    <option value="All">All</option>
                    <option value="Tuition">Tuition</option>
                    <option value="Transport">Transport</option>
                    <option value="Uniform">Uniform</option>
                    <option value="Event">Event</option>
                    <option value="Misc">Misc</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Mode
                  <select
                    value={ledgerFilters.paymentMode}
                    onChange={handleLedgerFilterChange('paymentMode')}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    <option value="All">All</option>
                    {PAYMENT_MODES.map((modeOption) => (
                      <option key={modeOption} value={modeOption}>
                        {modeOption}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  COA
                  <select
                    value={ledgerFilters.coa}
                    onChange={handleLedgerFilterChange('coa')}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    <option value="All">All</option>
                    {COA_INCOME.map((coaOption) => (
                      <option key={coaOption} value={coaOption}>
                        {coaOption}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Cost Center
                  <select
                    value={ledgerFilters.costCenter}
                    onChange={handleLedgerFilterChange('costCenter')}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    <option value="All">All</option>
                    {COST_CENTERS.map((center) => (
                      <option key={center} value={center}>
                        {center}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Class
                  <select
                    value={ledgerFilters.className}
                    onChange={handleLedgerFilterChange('className')}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    <option value="All">All</option>
                    {CLASS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:col-span-2">
                  Search
                  <input
                    type="text"
                    value={ledgerFilters.search}
                    onChange={handleLedgerFilterChange('search')}
                    placeholder="Student, parent email, voucher or notes"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  />
                </label>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Voucher No</th>
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Class</th>
                      <th className="px-4 py-3 text-left">Fee Type</th>
                      <th className="px-4 py-3 text-left">COA</th>
                      <th className="px-4 py-3 text-left">Cost Center</th>
                      <th className="px-4 py-3 text-left">Mode</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledgerEntriesView.map((entry) => {
                      const entryDate = entry.parsedDate || parseDateValue(entry.date);
                      const dateDisplay = entryDate ? entryDate.toLocaleDateString('en-IN') : '—';
                      const statusValue = entry.status || 'Paid';
                      const badgeClass = statusBadgeClasses[statusValue] || 'bg-slate-100 text-slate-600';
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-600">{dateDisplay}</td>
                          <td className="px-4 py-3 font-medium text-slate-700">{entry.voucher_no || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{entry.student_name || 'Misc Income'}</td>
                          <td className="px-4 py-3 text-slate-600">{entry.class_name || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{entry.fee_type || 'Tuition'}</td>
                          <td className="px-4 py-3 text-slate-600">{entry.coa || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{entry.cost_center || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{entry.payment_mode || entry.mode || 'Online'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {formatCurrency(entry.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                              {statusValue}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{entry.notes || '—'}</td>
                        </tr>
                      );
                    })}
                    {ledgerEntriesView.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">
                          {transactionsLog.length === 0
                            ? 'No ledger entries recorded yet.'
                            : 'No entries match the current filters.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'expenses' && (
          <section id="expenses" className="mt-8 space-y-6">
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
                <h2 className="text-lg font-semibold text-slate-900">Record Expense</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Log operational spending with optional invoice attachments.
                </p>
                <form className="mt-6 space-y-4" onSubmit={handleExpenseSubmit}>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Date
                    <input
                      type="date"
                      name="date"
                      value={expenseForm.date}
                      onChange={handleExpenseFieldChange}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Vendor
                    <input
                      name="vendor"
                      value={expenseForm.vendor}
                      onChange={handleExpenseFieldChange}
                      placeholder="ABC Suppliers"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Category
                      <select
                        name="category"
                        value={expenseForm.category}
                        onChange={handleExpenseFieldChange}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                      >
                        {EXPENSE_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Payment Mode
                      <select
                        name="paymentMode"
                        value={expenseForm.paymentMode}
                        onChange={handleExpenseFieldChange}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                      >
                        {['Cash', 'BankTransfer', 'UPI', 'Card'].map((modeOption) => (
                          <option key={modeOption} value={modeOption}>
                            {modeOption}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Amount (₹)
                    <input
                      name="amount"
                      value={expenseForm.amount}
                      onChange={handleExpenseFieldChange}
                      inputMode="decimal"
                      placeholder="0"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      COA
                      <select
                        name="coa"
                        value={expenseForm.coa}
                        onChange={handleExpenseFieldChange}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                      >
                        {COA_EXPENSE.map((coaOption) => (
                          <option key={coaOption} value={coaOption}>
                            {coaOption}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Cost Center
                      <select
                        name="costCenter"
                        value={expenseForm.costCenter}
                        onChange={handleExpenseFieldChange}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                      >
                        {COST_CENTERS.map((center) => (
                          <option key={center} value={center}>
                            {center}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Invoice No.
                      <input
                        name="invoiceNo"
                        value={expenseForm.invoiceNo}
                        onChange={handleExpenseFieldChange}
                        placeholder="INV-2024-001"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                      <select
                        name="status"
                        value={expenseForm.status}
                        onChange={handleExpenseFieldChange}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                      >
                        {EXPENSE_STATUS_OPTIONS.map((statusOption) => (
                          <option key={statusOption} value={statusOption}>
                            {statusOption}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Narration
                    <textarea
                      name="narration"
                      value={expenseForm.narration}
                      onChange={handleExpenseFieldChange}
                      rows={3}
                      placeholder="Brief note about the expense"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Attachment (optional)
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleExpenseAttachmentChange}
                      className="block text-sm text-slate-600"
                    />
                    {expenseAttachmentFile && (
                      <span className="text-xs text-slate-500">{expenseAttachmentFile.name}</span>
                    )}
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={expenseSubmitting}
                      className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {expenseSubmitting ? 'Saving…' : 'Save Expense'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Expenses Ledger</h2>
                    <p className="text-sm text-slate-500">
                      Review spend by vendor, status, and cost center.
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      Total in view: {formatCurrency(expenseTotalAmount)} · Entries: {expenseEntriesView.length}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    From Date
                    <input
                      type="date"
                      value={expenseFilters.startDate}
                      onChange={handleExpenseFilterChange('startDate')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    To Date
                    <input
                      type="date"
                      value={expenseFilters.endDate}
                      onChange={handleExpenseFilterChange('endDate')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Category
                    <select
                      value={expenseFilters.category}
                      onChange={handleExpenseFilterChange('category')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    >
                      <option value="All">All</option>
                      {EXPENSE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cost Center
                    <select
                      value={expenseFilters.costCenter}
                      onChange={handleExpenseFilterChange('costCenter')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    >
                      <option value="All">All</option>
                      {COST_CENTERS.map((center) => (
                        <option key={center} value={center}>
                          {center}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                    <select
                      value={expenseFilters.status}
                      onChange={handleExpenseFilterChange('status')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    >
                      <option value="All">All</option>
                      {EXPENSE_STATUS_OPTIONS.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:col-span-2">
                    Vendor
                    <input
                      type="text"
                      value={expenseFilters.vendor}
                      onChange={handleExpenseFilterChange('vendor')}
                      placeholder="Search vendor"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Expense ID</th>
                        <th className="px-4 py-3 text-left">Vendor</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-left">COA</th>
                        <th className="px-4 py-3 text-left">Cost Center</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-left">Mode</th>
                        <th className="px-4 py-3 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expenseEntriesView.map((entry) => {
                        const entryDate = entry.parsedDate || parseDateValue(entry.date);
                        const dateDisplay = entryDate ? entryDate.toLocaleDateString('en-IN') : '—';
                        return (
                          <tr
                            key={entry.id}
                            className="cursor-pointer hover:bg-slate-50"
                            onClick={() => handleExpenseRowClick(entry)}
                          >
                            <td className="px-4 py-3 text-slate-600">{dateDisplay}</td>
                            <td className="px-4 py-3 font-medium text-slate-700">{entry.expense_id || '—'}</td>
                            <td className="px-4 py-3 text-slate-700">{entry.vendor || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{entry.category || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{entry.coa || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{entry.cost_center || '—'}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(entry.amount)}</td>
                            <td className="px-4 py-3 text-slate-600">{entry.payment_mode || 'Cash'}</td>
                            <td className="px-4 py-3 text-slate-600">{entry.status || 'Paid'}</td>
                          </tr>
                        );
                      })}
                      {expenseEntriesView.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                            {loadingExpenses ? 'Loading expenses…' : 'No expenses match the selected filters.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'reports' && (
          <section id="reports" className="mt-8 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Monthly Collection Summary</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Download a CA-ready summary grouped by month for the selected range.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    From
                    <input
                      type="date"
                      value={reportRanges.collectionStart}
                      onChange={handleReportsRangeChange('collectionStart')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    To
                    <input
                      type="date"
                      value={reportRanges.collectionEnd}
                      onChange={handleReportsRangeChange('collectionEnd')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleDownloadMonthlyCollections}
                    disabled={reportsLoading.collections}
                    className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {reportsLoading.collections ? 'Preparing…' : 'Download CSV'}
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Outstanding Fee Report</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Export dues for follow-up with parents and auditors.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    From
                    <input
                      type="date"
                      value={reportRanges.outstandingStart}
                      onChange={handleReportsRangeChange('outstandingStart')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    To
                    <input
                      type="date"
                      value={reportRanges.outstandingEnd}
                      onChange={handleReportsRangeChange('outstandingEnd')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleDownloadOutstanding}
                    disabled={reportsLoading.outstanding}
                    className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {reportsLoading.outstanding ? 'Preparing…' : 'Download CSV'}
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Expenses Ledger Export</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Fetch expense entries with invoice references for audits.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    From
                    <input
                      type="date"
                      value={reportRanges.expenseStart}
                      onChange={handleReportsRangeChange('expenseStart')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    To
                    <input
                      type="date"
                      value={reportRanges.expenseEnd}
                      onChange={handleReportsRangeChange('expenseEnd')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleDownloadExpensesLedger}
                    disabled={reportsLoading.expenses}
                    className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {reportsLoading.expenses ? 'Preparing…' : 'Download CSV'}
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Cash Flow Statement</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Month-wise inflow versus outflow for finance review.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    From
                    <input
                      type="date"
                      value={reportRanges.cashFlowStart}
                      onChange={handleReportsRangeChange('cashFlowStart')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    To
                    <input
                      type="date"
                      value={reportRanges.cashFlowEnd}
                      onChange={handleReportsRangeChange('cashFlowEnd')}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleDownloadCashflow}
                    disabled={reportsLoading.cashflow}
                    className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {reportsLoading.cashflow ? 'Preparing…' : 'Download CSV'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'payment-history' && (
          <section className="mt-8 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Payment History</h2>
                  <p className="text-sm text-slate-500">
                    Review every cash and online payment with quick filtering by mode.
                  </p>
                </div>
                <label className="text-sm font-medium text-slate-600">
                  <span className="mr-2 hidden text-xs uppercase tracking-wide text-slate-500 md:inline">
                    Mode filter
                  </span>
                  <select
                    value={paymentModeFilter}
                    onChange={(event) => setPaymentModeFilter(event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    {paymentModeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingPayments && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                          Loading payment records…
                        </td>
                      </tr>
                    )}
                    {!loadingPayments &&
                      filteredPaymentsByMode.map((payment) => {
                        const modeLabel = payment.mode || 'Online';
                        const transactionRef = payment.transaction_id || payment.razorpay_payment_id || '—';
                        const dateValue = payment.date?.toDate
                          ? payment.date.toDate().toLocaleString()
                          : payment.date
                          ? new Date(payment.date).toLocaleString()
                          : '—';
                        return (
                          <tr key={payment.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3">{dateValue}</td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{payment.student_name || '—'}</div>
                              <div className="text-xs text-slate-500">{payment.studentId || payment.student_doc_id || '—'}</div>
                            </td>
                            <td className="px-4 py-3">{payment.class || '—'}</td>
                            <td className="px-4 py-3">₹{Number(payment.amount || 0).toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3">{modeLabel}</td>
                            <td className="px-4 py-3 text-slate-600">{transactionRef}</td>
                          </tr>
                        );
                      })}
                    {!loadingPayments && filteredPaymentsByMode.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                          No payments match the selected filter yet.
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

        {activeTab === 'house-settings' && (
          <section id="house-settings" className="mt-8 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-slate-900">House Settings</h2>
                <p className="text-sm text-slate-500">
                  Manage the list of school houses. These names appear while adding or editing students.
                </p>
              </div>
              <form className="mt-6 space-y-5" onSubmit={handleHouseSettingsSave}>
                <div className="space-y-3">
                  {(settingsState.houses || []).length > 0 ? (
                    settingsState.houses.map((house, index) => (
                      <div key={`${house}-${index}`} className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={house}
                          onChange={(event) => handleHouseNameChange(index, event.target.value)}
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                          placeholder="House name"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveHouse(index)}
                          className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      No houses added yet. Use the field below to add your first house.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={newHouseName}
                    onChange={(event) => setNewHouseName(event.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    placeholder="Add a house name"
                  />
                  <button
                    type="button"
                    onClick={handleAddHouseName}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Add House
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={houseSettingsSaving}
                    className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {houseSettingsSaving ? 'Saving…' : 'Save Houses'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}
      </main>

      {manualEntryModalOpen && (
        <Modal
          title="Add Manual Ledger Entry"
          onClose={() => {
            resetManualEntryForm();
            setManualEntryModalOpen(false);
          }}
        >
          <form className="space-y-4" onSubmit={handleManualEntrySave}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date
                <input
                  type="date"
                  name="date"
                  value={manualEntryForm.date}
                  onChange={handleManualEntryFieldChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Student
                <select
                  name="studentId"
                  value={manualEntryForm.studentId}
                  onChange={handleManualEntryFieldChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  <option value="">Misc / Not Linked</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} · {student.class || 'Class'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fee Type
                <select
                  name="feeType"
                  value={manualEntryForm.feeType}
                  onChange={handleManualEntryFieldChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  <option value="Tuition">Tuition</option>
                  <option value="Transport">Transport</option>
                  <option value="Uniform">Uniform</option>
                  <option value="Event">Event</option>
                  <option value="Misc">Misc</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Payment Mode
                <select
                  name="paymentMode"
                  value={manualEntryForm.paymentMode}
                  onChange={handleManualEntryFieldChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  {PAYMENT_MODES.map((modeOption) => (
                    <option key={modeOption} value={modeOption}>
                      {modeOption}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                COA
                <select
                  name="coa"
                  value={manualEntryForm.coa}
                  onChange={handleManualEntryFieldChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  {COA_INCOME.map((coaOption) => (
                    <option key={coaOption} value={coaOption}>
                      {coaOption}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cost Center
                <select
                  name="costCenter"
                  value={manualEntryForm.costCenter}
                  onChange={handleManualEntryFieldChange}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  {COST_CENTERS.map((center) => (
                    <option key={center} value={center}>
                      {center}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Amount (₹)
                <input
                  name="amount"
                  value={manualEntryForm.amount}
                  onChange={handleManualEntryFieldChange}
                  inputMode="decimal"
                  placeholder="0"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Notes
                <textarea
                  name="notes"
                  value={manualEntryForm.notes}
                  onChange={handleManualEntryFieldChange}
                  rows={3}
                  placeholder="Optional narration for this voucher"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  resetManualEntryForm();
                  setManualEntryModalOpen(false);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={manualEntrySubmitting}
                className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {manualEntrySubmitting ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selectedExpense && (
        <Modal
          title={`Expense · ${selectedExpense.expense_id || ''}`}
          onClose={handleCloseExpenseDetail}
        >
          <div className="space-y-3 text-sm text-slate-700">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</p>
                <p className="mt-1 font-medium text-slate-900">
                  {parseDateValue(selectedExpense.date)?.toLocaleDateString('en-IN') || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vendor</p>
                <p className="mt-1 font-medium text-slate-900">{selectedExpense.vendor || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</p>
                <p className="mt-1 font-medium text-slate-900">{selectedExpense.category || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</p>
                <p className="mt-1 font-semibold text-slate-900">{formatCurrency(selectedExpense.amount)}</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment Mode</p>
                <p className="mt-1 text-slate-700">{selectedExpense.payment_mode || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                <p className="mt-1 text-slate-700">{selectedExpense.status || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">COA</p>
                <p className="mt-1 text-slate-700">{selectedExpense.coa || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cost Center</p>
                <p className="mt-1 text-slate-700">{selectedExpense.cost_center || '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice Number</p>
              <p className="mt-1 text-slate-700">{selectedExpense.invoice_no || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Narration</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{selectedExpense.narration || '—'}</p>
            </div>
            {Array.isArray(selectedExpense.attachments) && selectedExpense.attachments.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attachments</p>
                <ul className="mt-2 space-y-2">
                  {selectedExpense.attachments.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-cardinal underline"
                      >
                        View file
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}

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
          houseOptions={houseOptions}
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

      {commonRequestContext.open && (
        <CommonFeeRequestModal
          state={commonRequestState}
          cycleOptions={REQUEST_CYCLE_OPTIONS}
          filteredStudents={commonFilteredStudents}
          onCycleChange={handleCommonCycleChange}
          onDueDateChange={handleCommonDueDateChange}
          onClassFilterChange={handleCommonClassFilterChange}
          onSearchChange={handleCommonSearchChange}
          onToggleStudent={handleCommonToggleStudent}
          onToggleAllFiltered={handleCommonToggleAllFiltered}
          onClearSelection={handleCommonClearSelection}
          onSubmit={handleCommonRequestSubmit}
          onClose={handleCloseCommonRequest}
          isSubmitting={commonRequestContext.submitting}
          resolveAmount={(student) =>
            getFeeAmountFromStructure(student.class, commonRequestState.cycle)
          }
          resolveAdvanceNotice={buildAdvancePlanNotice}
        />
      )}

      {feeReportDetailContext.open && feeReportDetailContext.student && (
        <Modal
          title={`Fee Details · ${feeReportDetailContext.student.name || feeReportDetailContext.student.studentId || 'Student'}`}
          onClose={closeFeeReportDetail}
          size="xl"
        >
          {(() => {
            const detailStudent = feeReportDetailContext.student;
            const recordBalance = Number(detailStudent.balance ?? detailStudent.fee_amount ?? 0);
            const outstandingFromRequests = feeReportDetailBalance;
            const hasOutstanding = recordBalance > 0 || outstandingFromRequests > 0;
            const markPaidActive = markPaidContext.student?.id === detailStudent.id;
            const parentName = detailStudent.parent_name || detailStudent.parentName || 'Parent';
            const parentEmail = detailStudent.parent_email || '—';
            const dueDateLabel = detailStudent.due_date
              ? new Date(detailStudent.due_date).toLocaleDateString('en-IN')
              : 'Not set';
            return (
              <div className="space-y-6 text-sm text-slate-700">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student</p>
                    <h4 className="mt-1 text-base font-semibold text-slate-900">{detailStudent.name}</h4>
                    <p className="text-xs text-slate-500">
                      ID: {detailStudent.studentId || detailStudent.id} · Class {detailStudent.class || '—'}
                      {detailStudent.section ? ` · Section ${detailStudent.section}` : ''}
                    </p>
                    {detailStudent.house && (
                      <p className="text-xs text-slate-500">
                        House: <span className="font-medium text-slate-900">{detailStudent.house}</span>
                      </p>
                    )}
                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                      <p className="font-semibold text-slate-600">Parent Contact</p>
                      <p className="text-slate-900">{parentName}</p>
                      <p className="text-slate-500">{parentEmail}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Balances</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Student record</p>
                        <p className={`text-2xl font-semibold ${recordBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {formatCurrency(recordBalance)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Fee requests</p>
                        <p className={`text-2xl font-semibold ${outstandingFromRequests > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {formatCurrency(outstandingFromRequests)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Due date on record: {dueDateLabel}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Head-wise summary</p>
                  {feeReportDetailHeadSummary.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No head-wise breakdown is available for this student.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm">
                      {feeReportDetailHeadSummary.map((entry) => (
                        <li key={entry.key} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                          <span className="font-medium text-slate-700">{entry.label}</span>
                          <span className="font-semibold text-slate-900">{formatCurrency(entry.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Requests ({feeReportDetailEntriesSorted.length})
                  </p>
                  {feeReportDetailEntriesSorted.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      No fee requests found for this student yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {feeReportDetailEntriesSorted.map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{entry.term || entry.cycle || 'Fee Request'}</p>
                              <p className="text-xs text-slate-500">
                                Due: {entry.dueDate ? entry.dueDate.toLocaleDateString('en-IN') : '—'} · Cycle: {entry.cycle || '—'}
                              </p>
                            </div>
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                statusBadgeClasses[entry.statusLabel] || 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {entry.statusLabel}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                            <div>
                              <p className="font-semibold text-slate-500">Amount</p>
                              <p className="text-slate-900">{formatCurrency(entry.amount)}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-500">Balance</p>
                              <p className="text-slate-900">{formatCurrency(entry.balance)}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-500">Payment Mode</p>
                              <p className="text-slate-900">{entry.paymentModeLabel || '—'}</p>
                            </div>
                          </div>
                          {Array.isArray(entry.headBreakdown) && entry.headBreakdown.length > 0 && (
                            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 text-xs">
                              {entry.headBreakdown.map((item) => (
                                <li key={`${entry.id}-${item.label}`} className="flex items-center justify-between px-3 py-2">
                                  <span className="text-slate-600">{item.label}</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(item.amount)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">Quick actions</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleDetailViewHistory}
                        className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        View History
                      </button>
                      <button
                        type="button"
                        onClick={handleDetailSendReminder}
                        disabled={!hasOutstanding}
                        className="rounded-full border border-cardinal px-4 py-2 text-xs font-semibold transition hover:bg-cardinal/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Send Reminder
                      </button>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">Mark as paid</p>
                      {markPaidActive && (
                        <button
                          type="button"
                          onClick={resetMarkPaidContext}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    {!hasOutstanding && (
                      <p className="mt-2 text-xs text-slate-500">All dues are already cleared for this student.</p>
                    )}
                    {hasOutstanding && !markPaidActive && (
                      <button
                        type="button"
                        onClick={() => beginMarkPaidFlow(detailStudent)}
                        className="mt-3 w-full rounded-full bg-cardinal px-4 py-2 text-xs font-semibold text-white transition hover:bg-cardinal/90"
                      >
                        Start mark as paid
                      </button>
                    )}
                    {hasOutstanding && markPaidActive && (
                      <div className="mt-3 space-y-3 text-xs">
                        <div className="flex flex-wrap gap-2">
                          {['Cash', 'Online'].map((modeOption) => (
                            <button
                              key={modeOption}
                              type="button"
                              onClick={() => handleMarkPaidModeSelect(modeOption)}
                              className={`rounded-full px-3 py-1 font-semibold transition ${
                                markPaidContext.mode === modeOption
                                  ? 'bg-cardinal text-white'
                                  : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {modeOption}
                            </button>
                          ))}
                        </div>
                        {markPaidContext.mode === 'Online' && (
                          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                            Transaction Reference
                            <input
                              value={markPaidContext.transactionId}
                              onChange={handleMarkPaidTransactionChange}
                              placeholder="Razorpay payment ID"
                              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                            />
                          </label>
                        )}
                        {markPaidContext.error && (
                          <p className="text-xs text-rose-600">{markPaidContext.error}</p>
                        )}
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={handleSubmitMarkPaidFromDetail}
                            disabled={markPaidContext.submitting}
                            className="rounded-full bg-cardinal px-4 py-2 text-xs font-semibold text-white transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {markPaidContext.submitting ? 'Recording…' : 'Confirm payment'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
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

      {signOutConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Sign Out</h3>
            <p className="mt-2 text-sm text-slate-600">Do you really want to sign out?</p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setSignOutConfirmOpen(false)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleConfirmSignOut}
                className="rounded-full bg-cardinal px-4 py-2 text-sm font-semibold text-white transition hover:bg-cardinal/90"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
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
