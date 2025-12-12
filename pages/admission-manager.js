import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';

const CLASS_OPTIONS = ['Nursery', 'UKG', 'LKG', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const NAV_TABS = [
  { id: 'inquiry', label: 'Inquiry' },
  { id: 'registration', label: 'Registration' },
  { id: 'admission', label: 'Admission' },
];

const ADMISSION_PAYMENT_PLANS = [
  {
    id: 'full',
    label: 'Standard',
    description: 'Collect 100% of admission + kit charges now.',
    upfrontFraction: 1,
    remainder: [],
  },
  {
    id: 'half',
    label: 'Special case · 50-50',
    description: 'Collect 50% now and the balance 50% within one month.',
    upfrontFraction: 0.5,
    remainder: [
      { id: 'half-balance', label: 'Remaining 50%', percent: 0.5, due: 'within one month' },
    ],
  },
  {
    id: 'staggered',
    label: 'Special case · 50-25-25',
    description: 'Collect 50% now, 25% within one month, and 25% before the session starts.',
    upfrontFraction: 0.5,
    remainder: [
      { id: 'staggered-25a', label: 'Second 25%', percent: 0.25, due: 'within one month' },
      { id: 'staggered-25b', label: 'Final 25%', percent: 0.25, due: 'before the session starts' },
    ],
  },
];

const buildDefaultSuperAdminCharges = (withExtras = false) =>
  CLASS_OPTIONS.reduce(
    (acc, className) => ({
      ...acc,
      [className]: {
        monthlyFees: 0,
        kitCharges: 0,
        storeCharges: 0,
        annualCharges: 0,
        ...(withExtras ? { admissionCharges: 0, registrationFees: 0 } : {}),
      },
    }),
    {},
  );

const formatSchoolNumber = (joiningYear, passingYear, sequence) => {
  const joining = String(joiningYear).slice(-2).padStart(2, '0');
  const passing = String(passingYear).slice(-2).padStart(2, '0');
  const sequencePart = String(sequence).padStart(3, '0');
  return `${joining}${sequencePart}${passing}`;
};

const normaliseYearValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const yearValue = Math.trunc(numeric);
  if (String(yearValue).length !== 4) return null;
  return yearValue;
};

const generateSchoolNumber = async (joiningYear, passingYear) => {
  const parsedJoining = normaliseYearValue(joiningYear);
  const parsedPassing = normaliseYearValue(passingYear);
  if (!parsedJoining || !parsedPassing) {
    throw new Error('Enter valid 4-digit years for joining and passing');
  }
  let generatedNumber = '';
  await runTransaction(db, async (transaction) => {
    const counterRef = doc(db, 'metadata', 'school_number_counters');
    const snapshot = await transaction.get(counterRef);
    const data = snapshot.exists() ? snapshot.data() : {};
    const lastSequence = Number(data.lastSequence || 0);
    const nextSequence = lastSequence + 1;
    if (nextSequence > 999) {
      throw new Error('School number sequence limit reached. Please reset the counter.');
    }
    generatedNumber = formatSchoolNumber(parsedJoining, parsedPassing, nextSequence);
    transaction.set(
      counterRef,
      {
        lastSequence: nextSequence,
        lastJoiningYear: parsedJoining,
        lastPassingYear: parsedPassing,
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );
  });
  return generatedNumber;
};

const useRazorpayScript = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (document.getElementById('razorpay-script')) return;
    const script = document.createElement('script');
    script.id = 'razorpay-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);
};

const parseDate = (value) => {
  if (!value) return null;
  if (value?.toDate) {
    const parsed = value.toDate();
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const SectionTabs = ({ tabs, active, onChange }) => (
  <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sub navigation">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onChange(tab.id)}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
          active === tab.id ? 'bg-cardinal text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
        role="tab"
        aria-selected={active === tab.id}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

const StudentIntakeModal = ({
  open,
  title,
  form,
  onChange,
  onClose,
  onSubmit,
  submitting,
  houseOptions = [],
  admissionType,
  error,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-10">
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{admissionType} intake</p>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">School number is generated automatically after entering years.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 px-6 py-4 text-sm text-slate-700">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 font-semibold">
              <span>Name</span>
              <input
                name="studentName"
                value={form.studentName}
                onChange={onChange}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              />
            </label>
            <label className="space-y-1 font-semibold">
              <span>Class</span>
              <select
                name="classApplied"
                value={form.classApplied}
                onChange={onChange}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              >
                <option value="">Select class</option>
                {CLASS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 font-semibold">
              <span>Section (optional)</span>
              <input
                name="section"
                value={form.section}
                onChange={onChange}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                placeholder="A"
              />
            </label>
            <label className="space-y-1 font-semibold">
              <span>House</span>
              <select
                name="house"
                value={form.house}
                onChange={onChange}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              >
                <option value="">Not assigned</option>
                {houseOptions.map((house) => (
                  <option key={house} value={house}>
                    {house}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 font-semibold">
              <span>Year of joining</span>
              <input
                name="yearOfJoining"
                type="number"
                value={form.yearOfJoining}
                onChange={onChange}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              />
            </label>
            <label className="space-y-1 font-semibold">
              <span>Year of passing</span>
              <input
                name="yearOfPassing"
                type="number"
                value={form.yearOfPassing}
                onChange={onChange}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 font-semibold">
              <span>Parent email</span>
              <input
                name="parentEmail"
                type="email"
                value={form.parentEmail}
                onChange={onChange}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                placeholder="parent@email.com"
              />
            </label>
            <label className="space-y-1 font-semibold">
              <span>Parent phone</span>
              <input
                name="parentPhone"
                value={form.parentPhone}
                onChange={onChange}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                placeholder="9876543210"
              />
            </label>
          </div>
          {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? 'Saving…' : 'Save student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ManualInquiryForm = ({ onSubmit, submitting, academicYears, activeAcademicYear }) => {
  const [form, setForm] = useState({
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    parentAddress: '',
    parentRelationship: '',
    studentName: '',
    dob: '',
    currentClass: '',
    classApplied: '',
    academicYear: activeAcademicYear || '',
    inquirySource: 'Walk-in',
    notes: '',
    referenceName: '',
    city: '',
    locality: '',
    currentSchool: '',
    board: '',
    purpose: '',
    preferredContact: '',
    bestTime: '',
  });

  useEffect(() => {
    setForm((prev) => ({ ...prev, academicYear: activeAcademicYear || prev.academicYear }));
  }, [activeAcademicYear]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form, () =>
      setForm((prev) => ({
        ...prev,
        parentName: '',
        parentPhone: '',
        parentEmail: '',
        parentAddress: '',
        parentRelationship: '',
        studentName: '',
        dob: '',
        currentClass: '',
        classApplied: '',
        inquirySource: 'Walk-in',
        notes: '',
        referenceName: '',
        city: '',
        locality: '',
        currentSchool: '',
        board: '',
        purpose: '',
        preferredContact: '',
        bestTime: '',
      })),
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Student Information</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Quick add</span>
          </div>
          <input
            name="studentName"
            value={form.studentName}
            onChange={handleChange}
            placeholder="Student name"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="date"
              name="dob"
              value={form.dob}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
            <input
              name="currentClass"
              value={form.currentClass}
              onChange={handleChange}
              placeholder="Current class"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              name="classApplied"
              value={form.classApplied}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            >
              <option value="">Class applying for</option>
              {CLASS_OPTIONS.map((classOption) => (
                <option key={classOption} value={classOption}>
                  {classOption}
                </option>
              ))}
            </select>
            <select
              name="academicYear"
              value={form.academicYear}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            >
              <option value="">Academic year for admission</option>
              {academicYears.map((year) => (
                <option key={year} value={year} disabled={year !== activeAcademicYear}>
                  {year} {year === activeAcademicYear ? '(current)' : '(inactive)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Parent / Guardian</h3>
            <input
              name="parentName"
              value={form.parentName}
              onChange={handleChange}
              placeholder="Name"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              required
            />
            <input
              name="parentPhone"
              value={form.parentPhone}
              onChange={handleChange}
              placeholder="Mobile number"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              required
            />
            <input
              type="email"
              name="parentEmail"
              value={form.parentEmail}
              onChange={handleChange}
              placeholder="Email"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
            <select
              name="parentRelationship"
              value={form.parentRelationship}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            >
              <option value="">Relationship to student</option>
              <option value="Mother">Mother</option>
              <option value="Father">Father</option>
              <option value="Guardian">Guardian</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Basic Location</h3>
            <input
              name="city"
              value={form.city}
              onChange={handleChange}
              placeholder="City"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
            <input
              name="locality"
              value={form.locality}
              onChange={handleChange}
              placeholder="Area or locality"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
            <textarea
              name="parentAddress"
              value={form.parentAddress}
              onChange={handleChange}
              placeholder="Full address (optional)"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              rows={3}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Academic Snapshot</h3>
            <input
              name="currentSchool"
              value={form.currentSchool}
              onChange={handleChange}
              placeholder="Current school name"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
            <input
              name="board"
              value={form.board}
              onChange={handleChange}
              placeholder="Board"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admission Intent</h3>
            <input
              name="purpose"
              value={form.purpose}
              onChange={handleChange}
              placeholder="Purpose of inquiry"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                name="preferredContact"
                value={form.preferredContact}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              >
                <option value="">Preferred contact mode</option>
                <option value="Call">Call</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Email">Email</option>
              </select>
              <input
                name="bestTime"
                value={form.bestTime}
                onChange={handleChange}
                placeholder="Best time to reach"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              />
            </div>
            <select
              name="inquirySource"
              value={form.inquirySource}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            >
              <option value="">How they found you</option>
              <option value="Walk-in">Walk-in</option>
              <option value="Phone Call">Phone Call</option>
              <option value="Referral">Referral</option>
              <option value="Social Media">Social Media</option>
              <option value="Website">Website</option>
              <option value="Event">Event</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-dashed border-cardinal/40 bg-cardinal/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-cardinal">Additional Note</h3>
              <p className="text-xs text-cardinal/80">Optional note for the counselor.</p>
            </div>
          </div>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Short message or questions"
            className="w-full rounded-xl border border-cardinal/30 bg-white px-4 py-3 text-sm text-slate-900 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 rounded-xl bg-cardinal px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-cardinal/90 disabled:opacity-60"
        >
          {submitting ? 'Saving inquiry...' : 'Create Inquiry'}
        </button>
      </div>
    </form>
  );
};

const PaymentModal = ({
  open,
  title,
  amount,
  studentName,
  onClose,
  onComplete,
  paymentPlans = [],
  summaryLabel = 'Total due',
}) => {
  const [mode, setMode] = useState('online');
  const [onlineMethod, setOnlineMethod] = useState('now');
  const [reference, setReference] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [processing, setProcessing] = useState(false);
  const plans = useMemo(
    () =>
      paymentPlans.length
        ? paymentPlans
        : [
            {
              id: 'full',
              label: 'Standard',
              description: 'Collect the full amount now.',
              upfrontFraction: 1,
              remainder: [],
            },
          ],
    [paymentPlans],
  );
  const hasPlans = plans.length > 1;
  const [selectedPlanId, setSelectedPlanId] = useState(plans[0]?.id || 'full');

  useEffect(() => {
    setSelectedPlanId(plans[0]?.id || 'full');
  }, [plans]);

  useEffect(() => {
    if (open) {
      setMode('online');
      setOnlineMethod('now');
      setReference('');
      setTransactionId('');
      setProcessing(false);
      setSelectedPlanId(plans[0]?.id || 'full');
    }
  }, [open, plans]);

  if (!open) return null;

  const numericAmount = Number(amount) || 0;
  const activePlan = plans.find((plan) => plan.id === selectedPlanId) || plans[0];
  const payableAmount = Math.max(
    0,
    Number((numericAmount * (activePlan?.upfrontFraction ?? 1)).toFixed(2)),
  );
  const planRemainder = (activePlan?.remainder || []).map((entry) => ({
    ...entry,
    amount: Number((numericAmount * (entry.percent ?? 0)).toFixed(2)),
    status: 'pending',
  }));
  const canSubmit =
    mode === 'online'
      ? onlineMethod === 'now'
        ? payableAmount > 0
        : payableAmount > 0 && transactionId.trim().length > 0
      : payableAmount > 0 && reference.trim().length > 0;

  const startOnlinePayment = async () => {
    if (typeof window === 'undefined' || !window.Razorpay) {
      alert('Payment gateway is still loading. Please try again.');
      return;
    }
    setProcessing(true);
    try {
      const orderResponse = await fetch('/api/createOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payableAmount, studentName }),
      });
      const orderData = await orderResponse.json();
      if (!orderData.success) {
        throw new Error(orderData.message || 'Unable to start payment');
      }

      const razorpay = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.order.amount,
        currency: 'INR',
        name: title || 'Payment',
        description: studentName,
        order_id: orderData.order.id,
        handler: async (response) => {
          try {
            const verifyResponse = await fetch('/api/verifyPayment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...response, amount: payableAmount }),
            });
            const verifyData = await verifyResponse.json();
            if (!verifyData.success) {
              throw new Error(verifyData.message || 'Payment verification failed');
            }
            await onComplete({
              amount: payableAmount,
              totalAmount: numericAmount,
              mode: 'Online',
              method: 'razorpay',
              reference: response.razorpay_payment_id,
              planId: activePlan?.id || 'full',
              planRemainder,
            });
            onClose();
          } catch (error) {
            alert(error.message || 'Unable to verify payment.');
          } finally {
            setProcessing(false);
          }
        },
        modal: { ondismiss: () => setProcessing(false) },
        theme: { color: '#A31F36' },
      });
      razorpay.open();
    } catch (error) {
      alert(error.message || 'Unable to start payment');
      setProcessing(false);
    }
  };

  const handleLogPayment = async () => {
    if (!canSubmit) return;
    setProcessing(true);
    try {
      const payload =
        mode === 'online' && onlineMethod === 'now'
          ? null
          : {
              amount: payableAmount,
              totalAmount: numericAmount,
              mode: mode === 'online' ? 'Online' : mode === 'cash' ? 'Cash' : 'Bank Transfer',
              method:
                mode === 'online'
                  ? onlineMethod === 'website'
                    ? 'online-recorded'
                    : 'razorpay'
                  : mode === 'cash'
                    ? 'cash'
                    : 'bank',
              reference: mode === 'online' ? transactionId : reference,
              planId: activePlan?.id || 'full',
              planRemainder,
            };

      if (payload) {
        await onComplete(payload);
        onClose();
      } else {
        await startOnlinePayment();
      }
    } catch (error) {
      alert(error.message || 'Unable to log payment');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Payment</p>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            Close
          </button>
        </div>
        <div className="px-6 py-5 text-sm text-slate-700">
          <p className="text-sm text-slate-600">Choose how you want to collect the amount.</p>

          {hasPlans && (
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payment plan</p>
              <div className="space-y-2">
                {plans.map((plan) => (
                  <label
                    key={plan.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition ${
                      selectedPlanId === plan.id
                        ? 'border-cardinal bg-cardinal/10 text-cardinal'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-cardinal/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment-plan"
                      value={plan.id}
                      checked={selectedPlanId === plan.id}
                      onChange={() => setSelectedPlanId(plan.id)}
                      className="mt-1"
                    />
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold">{plan.label}</p>
                      <p className="text-xs text-slate-500">{plan.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-700">{summaryLabel}</span>
              <span className="font-semibold">₹{numericAmount.toLocaleString('en-IN')}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-slate-500">Collect now</span>
              <span className="font-semibold text-cardinal">₹{payableAmount.toLocaleString('en-IN')}</span>
            </div>
            {planRemainder.length > 0 && (
              <ul className="mt-2 space-y-1">
                {planRemainder.map((installment) => (
                  <li key={installment.id} className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">{installment.label} ({installment.due})</span>
                    <span className="font-semibold text-amber-600">₹{installment.amount.toLocaleString('en-IN')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-xs font-semibold text-slate-500" htmlFor="payment-mode">
              Payment method
            </label>
            <select
              id="payment-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            >
              <option value="online">Online</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>

          {mode === 'online' && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Online options</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setOnlineMethod('now')}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    onlineMethod === 'now'
                      ? 'border-cardinal bg-cardinal/10 text-cardinal'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-cardinal/40'
                  }`}
                >
                  Pay now (Razorpay)
                </button>
                <button
                  type="button"
                  onClick={() => setOnlineMethod('website')}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    onlineMethod === 'website'
                      ? 'border-cardinal bg-cardinal/10 text-cardinal'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-cardinal/40'
                  }`}
                >
                  Recorded payment
                </button>
              </div>
            </div>
          )}

          <div className="mt-4">
            <label className="text-xs font-semibold text-slate-500" htmlFor="payment-amount">
              Amount (INR)
            </label>
            <input
              id="payment-amount"
              type="number"
              min="0"
              value={payableAmount}
              readOnly
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
            {numericAmount !== payableAmount && (
              <p className="mt-1 text-xs text-slate-500">Total due: ₹{numericAmount.toLocaleString('en-IN')}</p>
            )}
          </div>

          {mode === 'online' && onlineMethod === 'website' && (
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-500" htmlFor="transaction-id">
                Enter transaction ID
              </label>
              <input
                id="transaction-id"
                value={transactionId}
                onChange={(event) => setTransactionId(event.target.value)}
                placeholder="Transaction reference"
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              />
            </div>
          )}

          {mode === 'cash' && (
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-500" htmlFor="voucher-number">
                Voucher number
              </label>
              <input
                id="voucher-number"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Enter voucher number"
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              />
            </div>
          )}

          {mode === 'bank' && (
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-500" htmlFor="utr-number">
                UTR number
              </label>
              <input
                id="utr-number"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Enter UTR number"
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={processing || !canSubmit}
            onClick={handleLogPayment}
            className="rounded-lg bg-cardinal px-4 py-2 text-xs font-semibold text-white shadow hover:bg-cardinal/90 disabled:opacity-60"
          >
            {processing ? 'Processing...' : onlineMethod === 'now' && mode === 'online' ? 'Pay now' : 'Confirm payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RegistrationForm = ({ onSubmit, academicYears, activeAcademicYear, submitting }) => {
  const [form, setForm] = useState({
    studentName: '',
    classApplied: '',
    academicYear: activeAcademicYear || '',
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    inquired: false,
  });

  useEffect(() => {
    setForm((prev) => ({ ...prev, academicYear: activeAcademicYear || prev.academicYear }));
  }, [activeAcademicYear]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form, () =>
      setForm((prev) => ({
        ...prev,
        studentName: '',
        classApplied: '',
        parentName: '',
        parentPhone: '',
        parentEmail: '',
        inquired: false,
      })),
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="studentName"
          value={form.studentName}
          onChange={handleChange}
          placeholder="Student name"
          required
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
        />
        <select
          name="classApplied"
          value={form.classApplied}
          onChange={handleChange}
          required
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
        >
          <option value="">Select class</option>
          {CLASS_OPTIONS.map((classOption) => (
            <option key={classOption} value={classOption}>
              {classOption}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="parentName"
          value={form.parentName}
          onChange={handleChange}
          placeholder="Parent/Guardian name"
          required
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
        />
        <input
          name="parentPhone"
          value={form.parentPhone}
          onChange={handleChange}
          placeholder="Mobile number"
          required
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="email"
          name="parentEmail"
          value={form.parentEmail}
          onChange={handleChange}
          placeholder="Email (optional)"
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
        />
        <select
          name="academicYear"
          value={form.academicYear}
          onChange={handleChange}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
        >
          <option value="">Academic year</option>
          {academicYears.map((year) => (
            <option key={year} value={year} disabled={year !== activeAcademicYear}>
              {year} {year === activeAcademicYear ? '(current)' : '(inactive)'}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          name="inquired"
          checked={form.inquired}
          onChange={handleChange}
          className="h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal/60"
        />
        Student already inquired?
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:opacity-60"
        >
          {submitting ? 'Preparing payment...' : 'Create & collect payment'}
        </button>
      </div>
    </form>
  );
};
const MobileTabScroller = ({ tabs, active, onChange }) => (
  <div className="flex gap-2 overflow-x-auto pb-4 sm:hidden" role="tablist" aria-label="Admissions navigation">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onChange(tab.id)}
        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
          active === tab.id ? 'bg-cardinal text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
        role="tab"
        aria-selected={active === tab.id}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

const handlePrint = (title, body) => {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 16px; }
          h1 { font-size: 18px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f8fafc; }
          .footer { margin-top: 24px; font-size: 12px; }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `);
  win.document.close();
  win.print();
};

export default function AdminManagerPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState('inquiry');
  const [inquiryTab, setInquiryTab] = useState('new');
  const [registrationTab, setRegistrationTab] = useState('list');
  const [inquiries, setInquiries] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [academicYears, setAcademicYears] = useState(['2025-26', '2026-27', '2027-28']);
  const [activeAcademicYear, setActiveAcademicYear] = useState('2026-27');
  const [houses, setHouses] = useState([]);
  const [defaultDueDate, setDefaultDueDate] = useState('');
  const [superAdminCharges, setSuperAdminCharges] = useState({
    new: buildDefaultSuperAdminCharges(true),
    old: buildDefaultSuperAdminCharges(false),
  });
  const [creatingInquiry, setCreatingInquiry] = useState(false);
  const [registrationSubmitting, setRegistrationSubmitting] = useState(false);
  const [paymentModal, setPaymentModal] = useState({ open: false, title: '', amount: 0, context: null, type: null });
  const buildStudentForm = useCallback(
    (prefill = {}) => ({
      studentName: prefill.studentName || '',
      classApplied: prefill.classApplied || '',
      section: prefill.section || '',
      house: prefill.house || '',
      yearOfJoining: prefill.yearOfJoining || new Date().getFullYear(),
      yearOfPassing: prefill.yearOfPassing || new Date().getFullYear() + 12,
      parentEmail: prefill.parentEmail || '',
      parentPhone: prefill.parentPhone || '',
    }),
    [],
  );
  const [studentForm, setStudentForm] = useState(buildStudentForm());
  const [studentModal, setStudentModal] = useState({ open: false, admissionType: 'old', admission: null, title: '' });
  const [studentSubmitting, setStudentSubmitting] = useState(false);
  const [studentError, setStudentError] = useState('');

  useRazorpayScript();

  const getRegistrationFee = useCallback(
    (className) => superAdminCharges.new?.[className]?.registrationFees ?? 0,
    [superAdminCharges],
  );
  const getAdmissionFee = useCallback(
    (className) => superAdminCharges.new?.[className]?.admissionCharges ?? 0,
    [superAdminCharges],
  );
  const getKitCharge = useCallback(
    (className) => superAdminCharges.new?.[className]?.kitCharges ?? 0,
    [superAdminCharges],
  );
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setAuthChecked(true);
        router.replace('/');
        return;
      }
      const profileRef = doc(db, 'users', currentUser.uid);
      const profileSnap = await getDoc(profileRef);
      if (!profileSnap.exists() || profileSnap.data().role !== 'admission_manager') {
        setAuthChecked(true);
        router.replace('/unauthorized');
        return;
      }
      setUser(currentUser);
      setProfile(profileSnap.data());
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, 'inquiries'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setInquiries(data);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, 'registrations'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setRegistrations(data);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, 'admissions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setAdmissions(data);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, 'payments'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setPayments(data);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const generalSettingsRef = doc(db, 'settings', 'general');
    const unsub = onSnapshot(generalSettingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setHouses(Array.isArray(data.houses) ? data.houses : []);
        setDefaultDueDate(data.defaultDueDate || '');
      }
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const superAdminRef = doc(db, 'settings', 'super_admin');
    const unsub = onSnapshot(superAdminRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const studentSettings = data.students || {};
      const resolvedNew = studentSettings.new || studentSettings.newAdmission || {};
      const resolvedOld = studentSettings.old || studentSettings.oldAdmission || studentSettings || {};
      setSuperAdminCharges({
        new: { ...buildDefaultSuperAdminCharges(true), ...resolvedNew },
        old: { ...buildDefaultSuperAdminCharges(false), ...resolvedOld },
      });
    });
    return () => unsub();
  }, [user]);

  const getSuperAdminFee = useCallback(
    (className, admissionType = 'new') =>
      Number(superAdminCharges?.[admissionType]?.[className]?.monthlyFees || 0),
    [superAdminCharges],
  );

  const handleStudentFieldChange = (event) => {
    const { name, value } = event.target;
    setStudentError('');
    setStudentForm((prev) => ({
      ...prev,
      [name]: name === 'parentEmail' ? value.trim().toLowerCase() : value,
    }));
  };

  const closeStudentModal = () => {
    setStudentModal({ open: false, admissionType: 'old', admission: null, title: '' });
    setStudentForm(buildStudentForm());
    setStudentError('');
  };

  const openManualStudentModal = () => {
    setStudentForm(buildStudentForm());
    setStudentModal({
      open: true,
      admissionType: 'old',
      admission: null,
      title: 'Add student from header',
    });
  };

  const openAdmissionStudentModal = (admission) => {
    const currentYear = new Date().getFullYear();
    setStudentForm(
      buildStudentForm({
        studentName: admission?.studentName || '',
        classApplied: admission?.classAdmitted || '',
        parentEmail: admission?.parentEmail || '',
        parentPhone: admission?.parentPhone || '',
        yearOfJoining: currentYear,
        yearOfPassing: currentYear + 12,
      }),
    );
    setStudentModal({
      open: true,
      admissionType: 'new',
      admission,
      title: 'Welcome to school',
    });
  };

  const handleSubmitStudent = async (event) => {
    event.preventDefault();
    setStudentSubmitting(true);
    setStudentError('');

    try {
      const joiningYear = normaliseYearValue(studentForm.yearOfJoining);
      const passingYear = normaliseYearValue(studentForm.yearOfPassing);
      if (!joiningYear || !passingYear) {
        setStudentError('Please enter valid 4-digit years for joining and passing.');
        setStudentSubmitting(false);
        return;
      }
      const schoolNumber = await generateSchoolNumber(joiningYear, passingYear);
      const feeAmount = getSuperAdminFee(studentForm.classApplied, studentModal.admissionType);
      const resolvedSession = studentModal.admissionType === 'new' ? activeAcademicYear : 'old';
      const parentEmail = (studentForm.parentEmail || '').trim().toLowerCase();
      const parentPhone = (studentForm.parentPhone || '').trim();
      const studentPayload = {
        studentId: schoolNumber,
        school_number: schoolNumber,
        name: studentForm.studentName.trim(),
        class: studentForm.classApplied,
        section: studentForm.section.trim(),
        year_of_joining: joiningYear,
        year_of_passing: passingYear,
        parent_email: parentEmail,
        parent_phone: parentPhone,
        fee_cycle: 'Monthly',
        fee_amount: feeAmount,
        due_date: defaultDueDate || '',
        balance: feeAmount,
        status: 'Pending',
        term: '',
        session: resolvedSession,
        house: studentForm.house || '',
        admission_type: studentModal.admissionType,
        created_at: serverTimestamp(),
        added_by: profile?.name || user?.email || 'admission_manager',
      };

      const studentRef = await addDoc(collection(db, 'students'), studentPayload);

      if (studentModal.admission?.id) {
        await updateDoc(doc(db, 'admissions', studentModal.admission.id), {
          studentRecordId: studentRef.id,
          schoolNumber,
          status: 'onboarded',
          onboardedAt: serverTimestamp(),
        });
      }

      alert('Student profile created successfully.');
      closeStudentModal();
    } catch (error) {
      console.error('Student creation failed', error);
      setStudentError(error?.message || 'Unable to save student.');
    } finally {
      setStudentSubmitting(false);
    }
  };

  const getNextInquiryId = useCallback(async () => {
    const counterRef = doc(db, 'counters', 'inquiry');
    const nextValue = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const current = counterSnap.exists() ? Number(counterSnap.data().current || 0) : 0;
      const next = current + 1;
      transaction.set(counterRef, { current: next }, { merge: true });
      return next;
    });
    return `INQ-${String(nextValue).padStart(4, '0')}`;
  }, []);

  const handleCreateInquiry = useCallback(
    async (form, reset) => {
      if (!user) return;
      setCreatingInquiry(true);
      try {
        const inquiryId = await getNextInquiryId();
        const docRef = doc(collection(db, 'inquiries'), inquiryId);
        const timelineEntry = {
          message: `Inquiry created manually by ${profile?.name || user.email}`,
          text: `Inquiry created manually by ${profile?.name || user.email}`,
          type: 'inquiry_created',
          actor: profile?.name || user.email,
          userId: user.uid,
          createdAt: serverTimestamp(),
        };
        const noteEntry = form.notes
          ? [
              {
                text: form.notes,
                author: profile?.name || user.email,
                createdAt: serverTimestamp(),
              },
            ]
          : [];
        await setDoc(docRef, {
          ...form,
          inquiryId,
          status: 'inquiry',
          createdAt: serverTimestamp(),
          notes: noteEntry,
        });
        await addDoc(collection(docRef, 'timeline'), timelineEntry);
        reset();
        setInquiryTab('list');
      } catch (error) {
        alert('Could not create inquiry. Please try again.');
      } finally {
        setCreatingInquiry(false);
      }
    },
    [getNextInquiryId, profile?.name, user],
  );
  const handleRegistrationPayment = useCallback(
    async (paymentInfo, baseData) => {
      const registrationPayload = {
        ...baseData,
        status: 'registered',
        paymentStatus: 'paid',
        paymentMode: paymentInfo.mode,
        paymentReference: paymentInfo.reference,
        paymentMethod: paymentInfo.method,
        amountPaid: paymentInfo.amount,
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'registrations'), registrationPayload);
      if (baseData.inquiryId) {
        await updateDoc(doc(db, 'inquiries', baseData.inquiryId), { status: 'registered' });
      }
      await addDoc(collection(db, 'payments'), {
        registration_id: docRef.id,
        inquiry_id: baseData.inquiryId || null,
        student_name: baseData.studentName,
        amount: paymentInfo.amount,
        mode: paymentInfo.mode,
        method: paymentInfo.method,
        reference: paymentInfo.reference,
        type: 'registration',
        date: serverTimestamp(),
      });
    },
    [],
  );

  const handleAdmissionPayment = useCallback(async (paymentInfo, baseData) => {
    const totalAmount = Number(paymentInfo.totalAmount ?? baseData.totalAmount ?? paymentInfo.amount ?? 0);
    const collectedAmount = Number(paymentInfo.amount ?? 0);
    const paymentPlan = paymentInfo.planId || 'full';
    const remainingInstallments = (paymentInfo.planRemainder || []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      due: entry.due,
      percent: entry.percent,
      amount: Number((totalAmount * (entry.percent ?? 0)).toFixed(2)) || entry.amount || 0,
      status: 'pending',
    }));
    const balanceAmount = Math.max(totalAmount - collectedAmount, 0);
    const admissionPayload = {
      ...baseData,
      admissionFeeAmount: baseData.admissionFeeAmount ?? 0,
      kitChargeAmount: baseData.kitChargeAmount ?? 0,
      totalAmountDue: totalAmount,
      amountPaid: collectedAmount,
      balanceAmount,
      paymentPlan,
      remainingInstallments,
      status: balanceAmount > 0 ? 'partially_paid' : 'paid',
      sentToAccounts: true,
      createdAt: serverTimestamp(),
      paymentMode: paymentInfo.mode,
      paymentMethod: paymentInfo.method,
      paymentReference: paymentInfo.reference,
    };
    const docRef = await addDoc(collection(db, 'admissions'), admissionPayload);
    if (baseData.registrationId) {
      await updateDoc(doc(db, 'registrations', baseData.registrationId), {
        admissionStatus: 'admitted',
        admissionPlan: paymentPlan,
      });
    }
    await addDoc(collection(db, 'payments'), {
      admission_id: docRef.id,
      registration_id: baseData.registrationId || null,
      student_name: baseData.studentName,
      amount: collectedAmount,
      total_amount: totalAmount,
      balance_after: balanceAmount,
      payment_plan: paymentPlan,
      admission_amount: baseData.admissionFeeAmount ?? null,
      kit_amount: baseData.kitChargeAmount ?? null,
      mode: paymentInfo.mode,
      method: paymentInfo.method,
      reference: paymentInfo.reference,
      type: 'admission',
      date: serverTimestamp(),
    });
  }, []);

  const startRegistrationFromInquiry = (inquiry) => {
    const amount = getRegistrationFee(inquiry.classApplied);
    setPaymentModal({
      open: true,
      title: 'Registration payment',
      amount,
      context: { source: 'inquiry', inquiry },
      type: 'registration',
    });
    setRegistrationSubmitting(true);
  };

  const startManualRegistration = (form, reset) => {
    const amount = getRegistrationFee(form.classApplied);
    setPaymentModal({
      open: true,
      title: 'Registration payment',
      amount,
      context: { source: 'manual', form, reset },
      type: 'registration',
    });
    setRegistrationSubmitting(true);
  };

  const startAdmissionFromRegistration = useCallback(
    (registration) => {
      const admissionAmount = getAdmissionFee(registration.classApplied || registration.classAdmitted);
      const kitAmount = getKitCharge(registration.classApplied || registration.classAdmitted);
      const totalAmount = admissionAmount + kitAmount;
      setPaymentModal({
        open: true,
        title: 'Admission payment',
        amount: totalAmount,
        context: { registration, admissionAmount, kitAmount, totalAmount },
        type: 'admission',
        plans: ADMISSION_PAYMENT_PLANS,
      });
    },
    [getAdmissionFee, getKitCharge],
  );

  const closePaymentModal = () => {
    setPaymentModal({ open: false, title: '', amount: 0, context: null, type: null });
    setRegistrationSubmitting(false);
  };

  const handlePaymentComplete = async (paymentInfo) => {
    if (paymentModal.type === 'registration') {
      const { source, inquiry, form, reset } = paymentModal.context;
      const baseData =
        source === 'inquiry'
          ? {
              studentName: inquiry.studentName,
              classApplied: inquiry.classApplied,
              academicYear: inquiry.academicYear,
              parentName: inquiry.parentName,
              parentPhone: inquiry.parentPhone,
              parentEmail: inquiry.parentEmail,
              inquiryId: inquiry.id,
              inquired: true,
            }
          : {
              ...form,
              inquiryId: null,
              inquired: Boolean(form.inquired),
            };
      await handleRegistrationPayment(paymentInfo, baseData);
      if (reset) reset();
    }
    if (paymentModal.type === 'admission') {
      const { registration, admissionAmount, kitAmount, totalAmount } = paymentModal.context;
      if (!registration) return;
      const baseData = {
        studentName: registration.studentName,
        classAdmitted: registration.classApplied || registration.classAdmitted || '',
        parentName: registration.parentName,
        parentPhone: registration.parentPhone,
        registrationId: registration.id,
        notes: registration.notes || '',
        academicYear: registration.academicYear || '',
        admissionFeeAmount: admissionAmount ?? getAdmissionFee(registration.classApplied || registration.classAdmitted || ''),
        kitChargeAmount: kitAmount ?? getKitCharge(registration.classApplied || registration.classAdmitted || ''),
        totalAmount: totalAmount ?? paymentModal.amount,
      };
      await handleAdmissionPayment(paymentInfo, baseData);
    }
  };
  const downloadRegistrationReceipt = (registration) => {
    if (!registration) return;
    const date = parseDate(registration.createdAt);
    handlePrint(
      'Registration Receipt',
      `
        <h1>Registration Receipt</h1>
        <table>
          <tr><td>Student</td><td>${registration.studentName || ''}</td></tr>
          <tr><td>Class</td><td>${registration.classApplied || ''}</td></tr>
          <tr><td>Inquired</td><td>${registration.inquired ? 'Yes' : 'No'}</td></tr>
          <tr><td>Amount</td><td>₹${Number(registration.amountPaid || 0).toLocaleString('en-IN')}</td></tr>
          <tr><td>Mode</td><td>${registration.paymentMode || ''}</td></tr>
          <tr><td>Date</td><td>${date ? date.toLocaleString() : ''}</td></tr>
        </table>
        <p class="footer">Thank you for completing registration.</p>
      `,
    );
  };

  const downloadAdmissionReceipt = (admission) => {
    if (!admission) return;
    const date = parseDate(admission.createdAt);
    const admissionFeeAmount = Number(admission.admissionFeeAmount ?? 0);
    const kitChargeAmount = Number(admission.kitChargeAmount ?? 0);
    const totalAmount = Number(admission.totalAmountDue ?? admission.totalAmount ?? admission.amountPaid ?? 0);
    const paidNow = Number(admission.amountPaid ?? admission.amount ?? 0);
    const balanceAmount = Number(admission.balanceAmount ?? Math.max(totalAmount - paidNow, 0));
    const planLabel =
      admission.paymentPlan === 'staggered'
        ? '50-25-25'
        : admission.paymentPlan === 'half'
          ? '50-50'
          : 'Full payment';
    handlePrint(
      'Admission Receipt',
      `
        <h1>Admission Receipt</h1>
        <table>
          <tr><td>Student</td><td>${admission.studentName || ''}</td></tr>
          <tr><td>Class</td><td>${admission.classAdmitted || ''}</td></tr>
          <tr><td>Linked registration</td><td>${admission.registrationId || 'N/A'}</td></tr>
          <tr><td>Admission fee</td><td>₹${admissionFeeAmount.toLocaleString('en-IN')}</td></tr>
          <tr><td>Kit charges</td><td>₹${kitChargeAmount.toLocaleString('en-IN')}</td></tr>
          <tr><td>Total due</td><td>₹${totalAmount.toLocaleString('en-IN')}</td></tr>
          <tr><td>Collected now</td><td>₹${paidNow.toLocaleString('en-IN')}</td></tr>
          <tr><td>Balance</td><td>₹${balanceAmount.toLocaleString('en-IN')}</td></tr>
          <tr><td>Plan</td><td>${planLabel}</td></tr>
          <tr><td>Mode</td><td>${admission.paymentMode || ''}</td></tr>
          <tr><td>Date</td><td>${date ? date.toLocaleString() : ''}</td></tr>
        </table>
        <p class="footer">Forwarded to accountant for admission approval.</p>
      `,
    );
  };

  const admittedRegistrationIds = useMemo(
    () => new Set(admissions.filter((item) => item.registrationId).map((item) => item.registrationId)),
    [admissions],
  );

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    router.replace('/');
  }, [router]);

  const registrationExportHeaders = useMemo(
    () => [
      { key: 'studentName', label: 'Student Name' },
      { key: 'classApplied', label: 'Class' },
      { key: 'parentName', label: 'Parent/Guardian' },
      { key: 'parentPhone', label: 'Mobile' },
      { key: 'inquired', label: 'Inquired?' },
    ],
    [],
  );

  const downloadCsv = useCallback((rows, headers, filename) => {
    const headerRow = headers.map((header) => header.label).join(',');
    const dataRows = rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header.key] ?? '';
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(','),
    );
    const csv = [headerRow, ...dataRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, []);
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-cardinal">
        <p className="text-sm font-semibold">Loading portal...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-rose-50 via-white to-slate-50">
      <Head>
        <title>Admission Manager Portal</title>
      </Head>

      <header className="relative z-50 overflow-visible border-b border-white/60 bg-white/80 shadow-sm backdrop-blur-xl">
        <div className="absolute -left-16 top-0 h-32 w-32 rounded-full bg-cardinal/10 blur-3xl" aria-hidden="true" />
        <div className="absolute right-0 top-0 h-28 w-44 rounded-full bg-indigo-200/30 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Image src="/elnode.png" alt="Elnode logo" width={40} height={40} className="h-10 w-10" />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Admission Manager</p>
              <h1 className="text-xl font-semibold text-slate-900">Portal</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{profile?.name || 'Admission Team'}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={openManualStudentModal}
              className="rounded-lg border border-cardinal px-3 py-2 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
            >
              Add student
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4">
          <div className="hidden flex-wrap gap-2 pb-4 sm:flex" role="tablist" aria-label="Admissions navigation">
            {NAV_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id ? 'bg-cardinal text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                role="tab"
                aria-selected={activeTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:hidden">
        <MobileTabScroller tabs={NAV_TABS} active={activeTab} onChange={setActiveTab} />
      </div>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {activeTab === 'inquiry' && (
          <div className="space-y-4">
            <SectionTabs
              tabs={[
                { id: 'new', label: 'New Inquiry' },
                { id: 'list', label: 'Inquiry List' },
              ]}
              active={inquiryTab}
              onChange={setInquiryTab}
            />
            {inquiryTab === 'new' && (
              <ManualInquiryForm
                onSubmit={handleCreateInquiry}
                submitting={creatingInquiry}
                academicYears={academicYears}
                activeAcademicYear={activeAcademicYear}
              />
            )}
            {inquiryTab === 'list' && (
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inquiry List</p>
                    <h3 className="text-xl font-semibold text-slate-900">All inquiries</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCsv(inquiries, registrationExportHeaders, 'inquiries.csv')}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Download CSV
                  </button>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Student</th>
                        <th className="px-4 py-3 text-left">Class</th>
                        <th className="px-4 py-3 text-left">Parent</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inquiries.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3">{item.studentName}</td>
                          <td className="px-4 py-3">{item.classApplied || '—'}</td>
                          <td className="px-4 py-3">{item.parentName}</td>
                          <td className="px-4 py-3 space-x-2 text-xs font-semibold">
                            <button
                              type="button"
                              onClick={() => startRegistrationFromInquiry(item)}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                            >
                              Create registration
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadRegistrationReceipt({ ...item, inquired: true })}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                            >
                              Download inquiry form
                            </button>
                          </td>
                        </tr>
                      ))}
                      {inquiries.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-sm text-slate-500">
                            No inquiries yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'registration' && (
          <div className="space-y-4">
            <SectionTabs
              tabs={[
                { id: 'list', label: 'Registered students' },
                { id: 'create', label: 'Create new registration' },
              ]}
              active={registrationTab}
              onChange={setRegistrationTab}
            />
            {registrationTab === 'list' && (
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registered Students</p>
                    <h3 className="text-xl font-semibold text-slate-900">Payments completed</h3>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => downloadCsv(registrations, registrationExportHeaders, 'registered-students.csv')}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                    >
                      Download CSV
                    </button>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Student</th>
                        <th className="px-4 py-3 text-left">Class</th>
                        <th className="px-4 py-3 text-left">Parent</th>
                        <th className="px-4 py-3 text-left">Inquired?</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {registrations.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3">{item.studentName}</td>
                          <td className="px-4 py-3">{item.classApplied || '—'}</td>
                          <td className="px-4 py-3">{item.parentName}</td>
                          <td className="px-4 py-3">{item.inquired ? 'Yes' : 'No'}</td>
                          <td className="px-4 py-3 space-x-2 text-xs font-semibold">
                            <button
                              type="button"
                              onClick={() => startAdmissionFromRegistration(item)}
                              disabled={admittedRegistrationIds.has(item.id)}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              {admittedRegistrationIds.has(item.id) ? 'Admission completed' : 'Proceed for admission'}
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadRegistrationReceipt(item)}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                            >
                              Registration receipt
                            </button>
                          </td>
                        </tr>
                      ))}
                      {registrations.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
                            No registered students yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {registrationTab === 'create' && (
              <RegistrationForm
                onSubmit={startManualRegistration}
                academicYears={academicYears}
                activeAcademicYear={activeAcademicYear}
                submitting={registrationSubmitting}
              />
            )}
          </div>
        )}
        {activeTab === 'admission' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admissions</p>
                    <h3 className="text-xl font-semibold text-slate-900">Admitted students</h3>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Student</th>
                        <th className="px-4 py-3 text-left">Class</th>
                        <th className="px-4 py-3 text-left">Linked registration</th>
                        <th className="px-4 py-3 text-left">Plan & balance</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {admissions.map((admission) => {
                        const totalDue = Number(admission.totalAmountDue ?? admission.totalAmount ?? 0);
                        const paidNow = Number(admission.amountPaid ?? admission.amount ?? 0);
                        const balance = Number(admission.balanceAmount ?? Math.max(totalDue - paidNow, 0));
                        const onboarded = Boolean(admission.studentRecordId || admission.schoolNumber);
                        return (
                          <tr key={admission.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3">{admission.studentName}</td>
                            <td className="px-4 py-3">{admission.classAdmitted || '—'}</td>
                            <td className="px-4 py-3">{admission.registrationId || 'Direct'}</td>
                            <td className="px-4 py-3 space-y-1 text-xs text-slate-600">
                              <p className="font-semibold text-slate-800">
                                {admission.paymentPlan === 'staggered'
                                  ? '50-25-25'
                                  : admission.paymentPlan === 'half'
                                    ? '50-50'
                                    : 'Full'}
                              </p>
                              <p>Balance: ₹{balance.toLocaleString('en-IN')}</p>
                            </td>
                            <td className="px-4 py-3 space-x-2 text-xs font-semibold">
                              <button
                                type="button"
                                onClick={() => openAdmissionStudentModal(admission)}
                                disabled={onboarded}
                                className="rounded-lg border border-cardinal px-3 py-1 text-cardinal transition hover:bg-cardinal/10 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {onboarded ? 'Student created' : 'Welcome to school'}
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadAdmissionReceipt(admission)}
                                className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                              >
                                Admission receipt
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {admissions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-sm text-slate-500">
                            No admissions yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accountant handoff</p>
                <p className="mt-2 text-sm">
                  Use <strong>Welcome to school</strong> to generate the student profile instantly. The accountant no longer needs to approve admissions or add students—the record lands in the student list with the correct fee plan.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <PaymentModal
        open={paymentModal.open}
        title={paymentModal.title}
        amount={paymentModal.amount}
        studentName={
          paymentModal.context?.inquiry?.studentName ||
          paymentModal.context?.form?.studentName ||
          paymentModal.context?.registration?.studentName ||
          ''
        }
        onClose={closePaymentModal}
        paymentPlans={paymentModal.plans || []}
        summaryLabel={paymentModal.type === 'admission' ? 'Total (admission + kit)' : 'Registration fee'}
        onComplete={async (info) => {
          await handlePaymentComplete(info);
          closePaymentModal();
        }}
      />
      <StudentIntakeModal
        open={studentModal.open}
        title={studentModal.title}
        admissionType={studentModal.admissionType}
        form={studentForm}
        onChange={handleStudentFieldChange}
        onClose={closeStudentModal}
        onSubmit={handleSubmitStudent}
        submitting={studentSubmitting}
        houseOptions={houses}
        error={studentError}
      />
    </div>
  );
}
