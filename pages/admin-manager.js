import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  arrayUnion,
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

const NAV_TABS = [
  { id: 'new', label: 'New Inquiry' },
  { id: 'inquiry-list', label: 'Inquiry List' },
  { id: 'registered', label: 'Registered Students' },
  { id: 'receipts', label: 'Receipts' },
];

const defaultInquiryForm = {
  parentName: '',
  parentPhone: '',
  parentEmail: '',
  parentAddress: '',
  studentName: '',
  gender: '',
  dob: '',
  classApplied: '',
  academicYear: '',
  inquirySource: 'Walk-in',
  counselorName: '',
  notes: '',
  referenceName: '',
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

const ManualInquiryForm = ({ onSubmit, submitting }) => {
  const [form, setForm] = useState(defaultInquiryForm);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form, () => setForm(defaultInquiryForm));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Parent Details</h3>
          <input
            name="parentName"
            value={form.parentName}
            onChange={handleChange}
            placeholder="Parent Name"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            required
          />
          <input
            name="parentPhone"
            value={form.parentPhone}
            onChange={handleChange}
            placeholder="Parent Phone"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            required
          />
          <input
            type="email"
            name="parentEmail"
            value={form.parentEmail}
            onChange={handleChange}
            placeholder="Parent Email"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
          <textarea
            name="parentAddress"
            value={form.parentAddress}
            onChange={handleChange}
            placeholder="Parent Address"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            rows={3}
          />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Student Details</h3>
          <input
            name="studentName"
            value={form.studentName}
            onChange={handleChange}
            placeholder="Student Name"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            required
          />
          <div className="grid gap-3 md:grid-cols-2">
            <select
              name="gender"
              value={form.gender}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            >
              <option value="">Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
            <input
              type="date"
              name="dob"
              value={form.dob}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              name="classApplied"
              value={form.classApplied}
              onChange={handleChange}
              placeholder="Class Applied"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
            <input
              name="academicYear"
              value={form.academicYear}
              onChange={handleChange}
              placeholder="Academic Year"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </div>
        </div>
        <div className="space-y-3 md:col-span-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admission Details</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              name="inquirySource"
              value={form.inquirySource}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            >
              <option value="Walk-in">Walk-in</option>
              <option value="Phone Call">Phone Call</option>
              <option value="Referral">Referral</option>
              <option value="Manual">Manual</option>
            </select>
            <input
              name="counselorName"
              value={form.counselorName}
              onChange={handleChange}
              placeholder="Counselor Name"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
            <input
              name="referenceName"
              value={form.referenceName}
              onChange={handleChange}
              placeholder="Reference Name"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </div>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Notes"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            rows={4}
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

const InquiryDetail = ({ inquiry, payments, onAddNote, onEdit, onInitiatePayment }) => {
  const [noteText, setNoteText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(inquiry || {});

  useEffect(() => {
    setEditForm(inquiry || {});
  }, [inquiry]);

  if (!inquiry) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
        Select an inquiry to view details.
      </div>
    );
  }

  const latestPayment = useMemo(
    () => payments.find((payment) => payment.inquiry_id === inquiry.id || payment.inquiry_id === inquiry.inquiryId),
    [payments, inquiry],
  );

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const timelineEntries = Array.isArray(inquiry.timeline) ? inquiry.timeline : [];
  const notes = Array.isArray(inquiry.notes) ? inquiry.notes : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inquiry Detail</p>
          <h2 className="text-2xl font-bold text-slate-900">{inquiry.inquiryId || inquiry.id}</h2>
          <p className="text-sm text-slate-500">Status: {inquiry.status || 'inquiry'} · Token {inquiry.tokenStatus || 'pending'}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onInitiatePayment(inquiry)}
            disabled={inquiry.tokenStatus === 'paid'}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-60"
          >
            {inquiry.tokenStatus === 'paid' ? 'Token Paid' : 'Initiate Token Payment'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parent</p>
              <p className="text-sm font-semibold text-slate-900">{inquiry.parentName}</p>
              <p className="text-xs text-slate-500">{inquiry.parentPhone}</p>
              <p className="text-xs text-slate-500">{inquiry.parentEmail}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student</p>
              <p className="text-sm font-semibold text-slate-900">{inquiry.studentName}</p>
              <p className="text-xs text-slate-500">{inquiry.classApplied || 'N/A'}</p>
              <p className="text-xs text-slate-500">{inquiry.academicYear || '—'}</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</p>
              <p className="text-sm font-semibold text-slate-900">{inquiry.inquirySource}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Counselor</p>
              <p className="text-sm font-semibold text-slate-900">{inquiry.counselorName || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference</p>
              <p className="text-sm font-semibold text-slate-900">{inquiry.referenceName || '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
            <p className="text-sm text-slate-700">{notes[notes.length - 1]?.text || inquiry.notesText || 'No notes yet.'}</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment</p>
            {latestPayment ? (
              <div className="mt-2 text-sm text-slate-700">
                <p>Payment ID: {latestPayment.razorpay_payment_id || latestPayment.transaction_id}</p>
                <p>Amount: ₹{Number(latestPayment.amount || 0).toLocaleString('en-IN')}</p>
                <p>Status: {latestPayment.status}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No token payment recorded.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Timeline</p>
          </div>
          <div className="mt-3 space-y-3">
            {timelineEntries.length === 0 && <p className="text-xs text-slate-500">No timeline entries yet.</p>}
            {timelineEntries
              .slice()
              .sort((a, b) => {
                const aDate = parseDate(a.createdAt)?.getTime() || 0;
                const bDate = parseDate(b.createdAt)?.getTime() || 0;
                return bDate - aDate;
              })
              .map((entry, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p>{entry.text || entry.message}</p>
                  <p className="text-xs text-slate-500">{parseDate(entry.createdAt)?.toLocaleString() || ''}</p>
                </div>
              ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Notes</p>
          </div>
          <div className="mt-3 space-y-3">
            {notes.length === 0 && <p className="text-xs text-slate-500">No notes added yet.</p>}
            {notes
              .slice()
              .sort((a, b) => {
                const aDate = parseDate(a.createdAt)?.getTime() || 0;
                const bDate = parseDate(b.createdAt)?.getTime() || 0;
                return bDate - aDate;
              })
              .map((entry, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p>{entry.text}</p>
                  <p className="text-xs text-slate-500">{parseDate(entry.createdAt)?.toLocaleString() || ''}</p>
                </div>
              ))}
          </div>
          <div className="mt-4 space-y-3">
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Add a note"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              rows={3}
            />
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setEditMode((prev) => !prev)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {editMode ? 'Cancel edit' : 'Edit details'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!noteText.trim()) return;
                  onAddNote(noteText);
                  setNoteText('');
                }}
                className="rounded-lg bg-cardinal px-4 py-2 text-xs font-semibold text-white hover:bg-cardinal/90"
              >
                Add note
              </button>
            </div>
          </div>
        </div>
      </div>

      {editMode && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Edit details</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              name="parentName"
              value={editForm.parentName || ''}
              onChange={handleEditChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              placeholder="Parent Name"
            />
            <input
              name="parentPhone"
              value={editForm.parentPhone || ''}
              onChange={handleEditChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              placeholder="Parent Phone"
            />
            <input
              name="parentEmail"
              value={editForm.parentEmail || ''}
              onChange={handleEditChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              placeholder="Parent Email"
            />
            <input
              name="parentAddress"
              value={editForm.parentAddress || ''}
              onChange={handleEditChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              placeholder="Parent Address"
            />
            <input
              name="studentName"
              value={editForm.studentName || ''}
              onChange={handleEditChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              placeholder="Student Name"
            />
            <input
              name="classApplied"
              value={editForm.classApplied || ''}
              onChange={handleEditChange}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              placeholder="Class Applied"
            />
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditMode(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onEdit(editForm);
                setEditMode(false);
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const PaymentPopup = ({ open, inquiry, defaultAmount, onClose, onConfirm, processing }) => {
  const [amount, setAmount] = useState(defaultAmount || 0);

  useEffect(() => {
    setAmount(defaultAmount || 0);
  }, [defaultAmount, inquiry]);

  if (!open || !inquiry) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Token Payment</p>
            <h3 className="text-lg font-semibold text-slate-900">{inquiry.studentName}</h3>
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
          <p className="text-sm text-slate-600">Enter the token amount to collect via Razorpay.</p>
          <div className="mt-4">
            <label className="text-xs font-semibold text-slate-500" htmlFor="token-amount">
              Amount (INR)
            </label>
            <input
              id="token-amount"
              type="number"
              min="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            />
          </div>
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
            disabled={processing || !(Number(amount) > 0)}
            onClick={() => onConfirm(Number(amount))}
            className="rounded-lg bg-cardinal px-4 py-2 text-xs font-semibold text-white shadow hover:bg-cardinal/90 disabled:opacity-60"
          >
            {processing ? 'Processing...' : 'Start payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Receipts = ({ inquiries, payments, onPrintInquiry, onPrintToken, onPrintRegistration }) => {
  const lookupInquiry = (payment) =>
    inquiries.find((item) => item.id === payment.inquiry_id || item.inquiryId === payment.inquiry_id);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receipts</p>
          <h3 className="text-xl font-semibold text-slate-900">History</h3>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Inquiry</th>
              <th className="px-4 py-3 text-left">Student</th>
              <th className="px-4 py-3 text-left">Amount</th>
              <th className="px-4 py-3 text-left">Mode</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((payment) => {
              const inquiry = lookupInquiry(payment);
              const date = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
              return (
                <tr key={payment.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">{Number.isFinite(date.getTime()) ? date.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3">{payment.inquiry_id || inquiry?.inquiryId || inquiry?.id || 'N/A'}</td>
                  <td className="px-4 py-3">{payment.student_name || inquiry?.studentName || '—'}</td>
                  <td className="px-4 py-3">₹{Number(payment.amount || 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">{payment.mode || 'Online'}</td>
                  <td className="px-4 py-3 space-x-2 text-xs font-semibold">
                    {inquiry && (
                      <button
                        type="button"
                        onClick={() => onPrintInquiry(inquiry)}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                      >
                        Inquiry
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onPrintToken(payment, inquiry)}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                    >
                      Token
                    </button>
                    {inquiry && (
                      <button
                        type="button"
                        onClick={() => onPrintRegistration(inquiry, payment)}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                      >
                        Registration
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {payments.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">No receipts available yet.</p>
        )}
      </div>
    </div>
  );
};

export default function AdminManagerPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState('new');
  const [inquiries, setInquiries] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [paymentContext, setPaymentContext] = useState({ open: false, inquiry: null });
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  useRazorpayScript();

  const selectedInquiry = useMemo(
    () => inquiries.find((item) => item.id === selectedInquiryId) || null,
    [inquiries, selectedInquiryId],
  );

  const registeredInquiries = useMemo(
    () => inquiries.filter((item) => item.status === 'registered' || item.tokenStatus === 'paid'),
    [inquiries],
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
      if (!selectedInquiryId && data.length > 0) {
        setSelectedInquiryId(data[0].id);
      }
    });
    return () => unsub();
  }, [user, selectedInquiryId]);

  useEffect(() => {
    if (!user) return undefined;
    const q = query(collection(db, 'payments'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setPayments(data);
    });
    return () => unsub();
  }, [user]);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    router.replace('/');
  }, [router]);

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
      setCreating(true);
      try {
        const inquiryId = await getNextInquiryId();
        const docRef = doc(collection(db, 'inquiries'), inquiryId);
        const timelineEntry = {
          text: `Inquiry created manually by ${profile?.name || user.email}`,
          type: 'inquiry_created',
          actor: profile?.name || user.email,
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
          tokenStatus: 'pending',
          createdAt: serverTimestamp(),
          timeline: [timelineEntry],
          notes: noteEntry,
        });
        setSelectedInquiryId(docRef.id);
        setActiveTab('inquiry-list');
        reset();
      } catch (error) {
        console.error('Unable to create inquiry', error);
        alert('Could not create inquiry. Please try again.');
      } finally {
        setCreating(false);
      }
    },
    [getNextInquiryId, profile?.name, user],
  );

  const handleAddNote = useCallback(
    async (note) => {
      if (!selectedInquiry) return;
      const inquiryRef = doc(db, 'inquiries', selectedInquiry.id);
      await updateDoc(inquiryRef, {
        notes: arrayUnion({ text: note, author: profile?.name || user.email, createdAt: serverTimestamp() }),
        timeline: arrayUnion({
          text: `Note added by ${profile?.name || user.email}`,
          type: 'note',
          createdAt: serverTimestamp(),
        }),
      });
    },
    [profile?.name, selectedInquiry, user],
  );

  const handleEditInquiry = useCallback(
    async (updated) => {
      if (!selectedInquiry) return;
      const inquiryRef = doc(db, 'inquiries', selectedInquiry.id);
      await updateDoc(inquiryRef, {
        parentName: updated.parentName || '',
        parentPhone: updated.parentPhone || '',
        parentEmail: updated.parentEmail || '',
        parentAddress: updated.parentAddress || '',
        studentName: updated.studentName || '',
        classApplied: updated.classApplied || '',
        updatedAt: serverTimestamp(),
        timeline: arrayUnion({
          text: `Inquiry updated by ${profile?.name || user.email}`,
          type: 'update',
          createdAt: serverTimestamp(),
        }),
      });
    },
    [profile?.name, selectedInquiry, user],
  );

  const handlePrint = useCallback((title, html) => {
    if (typeof window === 'undefined') return;
    const win = window.open('', '_blank', 'width=720,height=900');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: 'Inter', Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { color: #A31F36; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
            .footer { margin-top: 24px; font-size: 12px; color: #475569; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    win.document.close();
    win.print();
  }, []);

  const printInquiryReceipt = useCallback(
    (inquiry) => {
      if (!inquiry) return;
      const created = parseDate(inquiry.createdAt);
      handlePrint(
        'Inquiry Receipt',
        `
          <h1>Inquiry Receipt</h1>
          <p>Inquiry ID: <strong>${inquiry.inquiryId || inquiry.id}</strong></p>
          <table>
            <tr><td>Parent Name</td><td>${inquiry.parentName || ''}</td></tr>
            <tr><td>Parent Phone</td><td>${inquiry.parentPhone || ''}</td></tr>
            <tr><td>Parent Email</td><td>${inquiry.parentEmail || ''}</td></tr>
            <tr><td>Address</td><td>${inquiry.parentAddress || ''}</td></tr>
            <tr><td>Student Name</td><td>${inquiry.studentName || ''}</td></tr>
            <tr><td>Class Applied</td><td>${inquiry.classApplied || ''}</td></tr>
            <tr><td>Academic Year</td><td>${inquiry.academicYear || ''}</td></tr>
            <tr><td>Counselor</td><td>${inquiry.counselorName || ''}</td></tr>
            <tr><td>Date</td><td>${created ? created.toLocaleString() : ''}</td></tr>
          </table>
          <p class="footer">Signature: ______________________</p>
        `,
      );
    },
    [handlePrint],
  );

  const printTokenReceipt = useCallback(
    (payment, inquiry) => {
      if (!payment) return;
      const date = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
      handlePrint(
        'Token Payment Receipt',
        `
          <h1>Token Payment Receipt</h1>
          <p>Inquiry ID: <strong>${inquiry?.inquiryId || inquiry?.id || payment.inquiry_id || ''}</strong></p>
          <table>
            <tr><td>Payment ID</td><td>${payment.razorpay_payment_id || payment.transaction_id || ''}</td></tr>
            <tr><td>Order ID</td><td>${payment.razorpay_order_id || ''}</td></tr>
            <tr><td>Amount</td><td>₹${Number(payment.amount || 0).toLocaleString('en-IN')}</td></tr>
            <tr><td>Mode</td><td>${payment.mode || 'Online'}</td></tr>
            <tr><td>Date</td><td>${Number.isFinite(date.getTime()) ? date.toLocaleString() : ''}</td></tr>
          </table>
          <p class="footer">Processed via Razorpay.</p>
        `,
      );
    },
    [handlePrint],
  );

  const printRegistrationReceipt = useCallback(
    (inquiry, payment) => {
      if (!inquiry) return;
      const date = payment?.date?.toDate ? payment.date.toDate() : payment?.date ? new Date(payment.date) : null;
      handlePrint(
        'Registration Receipt',
        `
          <h1>Registration Receipt</h1>
          <p>Inquiry ID: <strong>${inquiry.inquiryId || inquiry.id}</strong></p>
          <table>
            <tr><td>Student</td><td>${inquiry.studentName || ''}</td></tr>
            <tr><td>Class</td><td>${inquiry.classApplied || ''}</td></tr>
            <tr><td>Token Status</td><td>${inquiry.tokenStatus || 'pending'}</td></tr>
            <tr><td>Payment Ref</td><td>${payment?.razorpay_payment_id || payment?.transaction_id || '—'}</td></tr>
            <tr><td>Date</td><td>${date ? date.toLocaleString() : ''}</td></tr>
          </table>
          <p class="footer">Next steps: complete document verification and finalize admission.</p>
        `,
      );
    },
    [handlePrint],
  );

  const handleInitiatePayment = useCallback((inquiry) => {
    setPaymentContext({ open: true, inquiry });
  }, []);

  const handleProcessPayment = useCallback(
    async (amount) => {
      if (!paymentContext.inquiry || !user) return;
      if (typeof window === 'undefined' || !window.Razorpay) {
        alert('Payment gateway is still loading. Please try again in a moment.');
        return;
      }
      setPaymentProcessing(true);
      try {
        const orderResponse = await fetch('/api/createOrder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            userId: user.uid,
            studentName: paymentContext.inquiry.studentName,
            parentEmail: paymentContext.inquiry.parentEmail,
            breakdown: [{ label: 'Admission Token', amount, type: 'admission' }],
          }),
        });
        const orderData = await orderResponse.json();
        if (!orderData.success) {
          throw new Error(orderData.message || 'Unable to initiate payment');
        }

        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: orderData.order.amount,
          currency: 'INR',
          name: 'Admission Token',
          description: `Admission token for ${paymentContext.inquiry.studentName}`,
          order_id: orderData.order.id,
          handler: async (response) => {
            try {
              const verifyResponse = await fetch('/api/verifyPayment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...response,
                  amount,
                  inquiryId: paymentContext.inquiry.id,
                  studentName: paymentContext.inquiry.studentName,
                  className: paymentContext.inquiry.classApplied,
                  parentEmail: paymentContext.inquiry.parentEmail,
                  paymentMode: 'Online',
                }),
              });
              const verifyData = await verifyResponse.json();
              if (!verifyData.success) {
                throw new Error(verifyData.message || 'Payment verification failed');
              }
              await updateDoc(doc(db, 'inquiries', paymentContext.inquiry.id), {
                status: 'registered',
                tokenStatus: 'paid',
                timeline: arrayUnion({
                  text: 'Token payment received',
                  type: 'payment',
                  createdAt: serverTimestamp(),
                }),
              });
              alert('Token payment received. Inquiry registered.');
            } catch (error) {
              console.error(error);
              alert(error.message || 'Unable to verify payment.');
            } finally {
              setPaymentProcessing(false);
              setPaymentContext({ open: false, inquiry: null });
            }
          },
          prefill: {
            name: paymentContext.inquiry.parentName,
            email: paymentContext.inquiry.parentEmail,
            contact: paymentContext.inquiry.parentPhone,
          },
          notes: {
            inquiry_id: paymentContext.inquiry.id,
          },
          theme: {
            color: '#A31F36',
          },
          modal: {
            ondismiss: () => {
              setPaymentProcessing(false);
            },
          },
        };
        const razorpay = new window.Razorpay(options);
        razorpay.open();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to start payment. Please try again.');
        setPaymentProcessing(false);
      }
    },
    [paymentContext.inquiry, user],
  );

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-cardinal">
        <p className="text-sm font-semibold">Loading portal...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Head>
        <title>Admission Manager Portal</title>
      </Head>
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Logo" width={40} height={40} className="h-10 w-10" />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Admission Manager</p>
              <h1 className="text-xl font-semibold text-slate-900">Manual CRM</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{profile?.name || 'Admission Team'}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
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
          <div className="flex gap-2 overflow-x-auto pb-2">
            {NAV_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-cardinal text-white shadow'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {activeTab === 'new' && <ManualInquiryForm onSubmit={handleCreateInquiry} submitting={creating} />}

        {activeTab === 'inquiry-list' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Inquiries</p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {inquiries.length}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {inquiries.map((item) => {
                  const created = parseDate(item.createdAt);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedInquiryId(item.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        selectedInquiryId === item.id
                          ? 'border-cardinal bg-cardinal/5 text-cardinal'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-cardinal/40'
                      }`}
                    >
                      <p className="font-semibold">{item.studentName}</p>
                      <p className="text-xs text-slate-500">{item.inquiryId || item.id}</p>
                      <p className="text-xs text-slate-500">{created ? created.toLocaleDateString() : ''}</p>
                    </button>
                  );
                })}
                {inquiries.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-500">No inquiries yet.</p>
                )}
              </div>
            </div>
            <div className="lg:col-span-2">
              <InquiryDetail
                inquiry={selectedInquiry}
                payments={payments}
                onAddNote={handleAddNote}
                onEdit={handleEditInquiry}
                onInitiatePayment={handleInitiatePayment}
              />
            </div>
          </div>
        )}

        {activeTab === 'registered' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registered Students</p>
                <h3 className="text-xl font-semibold text-slate-900">Completed token payments</h3>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                {registeredInquiries.length}
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Student</th>
                    <th className="px-4 py-3 text-left">Class</th>
                    <th className="px-4 py-3 text-left">Parent</th>
                    <th className="px-4 py-3 text-left">Token Status</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {registeredInquiries.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">{item.studentName}</td>
                      <td className="px-4 py-3">{item.classApplied || '—'}</td>
                      <td className="px-4 py-3">{item.parentName}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Paid</span>
                      </td>
                      <td className="px-4 py-3 space-x-2 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setSelectedInquiryId(item.id)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const payment = payments.find(
                              (pay) => pay.inquiry_id === item.id || pay.inquiry_id === item.inquiryId,
                            );
                            printRegistrationReceipt(item, payment);
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                        >
                          Registration Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                  {registeredInquiries.length === 0 && (
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

        {activeTab === 'receipts' && (
          <Receipts
            inquiries={inquiries}
            payments={payments.filter((payment) => payment.inquiry_id)}
            onPrintInquiry={printInquiryReceipt}
            onPrintToken={printTokenReceipt}
            onPrintRegistration={printRegistrationReceipt}
          />
        )}
      </main>

      <PaymentPopup
        open={paymentContext.open}
        inquiry={paymentContext.inquiry}
        defaultAmount={5000}
        processing={paymentProcessing}
        onClose={() => setPaymentContext({ open: false, inquiry: null })}
        onConfirm={handleProcessPayment}
      />
    </div>
  );
}
