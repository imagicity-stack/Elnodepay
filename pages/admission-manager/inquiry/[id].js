import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import jsPDF from 'jspdf';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import InquiryProfileCard from '../../../components/InquiryProfileCard';
import FollowUpPanel from '../../../components/FollowUpPanel';
import NotesPanel from '../../../components/NotesPanel';
import DocumentsPanel from '../../../components/DocumentsPanel';
import { auth, storage } from '../../../lib/firebase';
import {
  addNote,
  addTimelineEntry,
  confirmAdmission,
  createOfferLetterRecord,
  createVisit,
  fetchInquiry,
  fetchUserRole,
  saveInquiry,
  scheduleFollowUp,
  updateDocumentStatus,
  updateTokenPayment,
  updateVisitStatus,
  uploadDocument,
} from '../../../lib/admissionService';

const useAdmissionGuard = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/unauthorized');
        return;
      }
      const roles = await fetchUserRole(user.uid);
      if (!roles.includes('admission_manager')) {
        router.push('/unauthorized');
        return;
      }
      setLoading(false);
    });
    return () => unsub();
  }, [router]);
  return { loading };
};

const Timeline = ({ items = [] }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h3 className="text-lg font-semibold text-slate-900">Timeline</h3>
    <div className="mt-3 space-y-3">
      {items.map((item, index) => (
        <div key={`${item.createdAt?.seconds || index}-${item.type}`} className="flex items-start gap-3">
          <div className="h-2 w-2 rounded-full bg-cardinal" />
          <div>
            <p className="text-sm font-semibold text-slate-900">{item.label || item.type}</p>
            <p className="text-xs text-slate-500">
              {item.createdAt?.toDate?.() ? item.createdAt.toDate().toLocaleString('en-IN') : 'Just now'}
            </p>
          </div>
        </div>
      ))}
      {!items.length && <p className="text-sm text-slate-500">No timeline yet.</p>}
    </div>
  </div>
);

const formatDateValue = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const TokenPaymentCard = ({ payment, onReminder, onUpdate }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold text-slate-900">Token payment</h3>
      {payment?.status === 'paid' ? (
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Paid</span>
      ) : (
        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Pending</span>
      )}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-700">
      <div>
        <p className="font-semibold text-slate-900">Mode</p>
        <p>{payment?.mode || '—'}</p>
      </div>
      <div>
        <p className="font-semibold text-slate-900">Amount</p>
        <p>{payment?.amount ? `₹${payment.amount}` : '—'}</p>
      </div>
      <div>
        <p className="font-semibold text-slate-900">Date</p>
        <p>{formatDateValue(payment?.date)?.toLocaleDateString('en-IN') || '—'}</p>
      </div>
    </div>
    <div className="mt-3 flex gap-2">
      {payment?.status === 'paid' ? (
        <button
          type="button"
          onClick={() => onUpdate({ ...payment, status: 'paid' })}
          className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
        >
          Mark as token paid
        </button>
      ) : (
        <button
          type="button"
          onClick={onReminder}
          className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white"
        >
          Create follow-up
        </button>
      )}
    </div>
  </div>
);

const VisitPanel = ({ inquiryId, onCreate, onUpdateStatus }) => {
  const handleSubmit = (event) => {
    event.preventDefault();
    const form = event.target;
    onCreate({
      date: form.date.value,
      time: form.time.value,
      parentName: form.parentName.value,
      inquiryId: inquiryId || form.inquiryId.value,
    });
    form.reset();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Campus visit</h3>
      <form onSubmit={handleSubmit} className="mt-3 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="inquiryId" value={inquiryId} />
        <div>
          <label className="text-xs font-semibold text-slate-500">Date</label>
          <input
            type="date"
            name="date"
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Time</label>
          <input
            type="time"
            name="time"
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Parent name</label>
          <input
            type="text"
            name="parentName"
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Book slot
          </button>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {['completed', 'rescheduled', 'no_show'].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onUpdateStatus(status)}
            className="rounded-xl bg-slate-100 px-3 py-2 font-semibold capitalize text-slate-800 hover:bg-slate-200"
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-900">Counsellor checklist</p>
        <ul className="list-disc pl-5">
          <li>Verify documents</li>
          <li>Capture visit notes</li>
          <li>Confirm next action</li>
        </ul>
      </div>
    </div>
  );
};

const InquiryProfilePage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { loading } = useAdmissionGuard();
  const [inquiry, setInquiry] = useState(null);

  const loadInquiry = async () => {
    if (!id) return;
    const data = await fetchInquiry(id);
    setInquiry(data);
  };

  useEffect(() => {
    loadInquiry();
  }, [id]);

  const handleSave = async () => {
    await saveInquiry(id, inquiry);
    await addTimelineEntry(id, { type: 'update', label: 'Inquiry updated' });
    loadInquiry();
  };

  const handleFollowUp = async (payload) => {
    await scheduleFollowUp(id, payload);
    loadInquiry();
  };

  const handleLogAction = async (entry) => {
    await addTimelineEntry(id, entry);
    loadInquiry();
  };

  const handleDocumentUpload = async (file) => {
    await uploadDocument(id, file);
    loadInquiry();
  };

  const handleDocumentStatus = async (statuses) => {
    await updateDocumentStatus(id, statuses);
    loadInquiry();
  };

  const handleVisitCreate = async (payload) => {
    await createVisit({ ...payload, inquiryId: id });
    loadInquiry();
  };

  const handleVisitStatus = async (status) => {
    await updateVisitStatus(id, status);
    loadInquiry();
  };

  const handleTokenReminder = async () => {
    await scheduleFollowUp(id, { date: new Date().toISOString(), status: 'pending' });
    loadInquiry();
  };

  const handleTokenUpdate = async (payment) => {
    await updateTokenPayment(id, payment);
    loadInquiry();
  };

  const handleOfferLetter = async () => {
    const doc = new jsPDF();
    doc.text('Offer Letter', 10, 10);
    doc.text(`Student: ${inquiry.studentName}`, 10, 20);
    doc.text(`Parent: ${inquiry.parentName}`, 10, 30);
    doc.text(`Class: ${inquiry.classApplied}`, 10, 40);
    const blob = doc.output('blob');
    const fileRef = ref(storage, `offerLetters/${id}.pdf`);
    await uploadBytes(fileRef, blob);
    const url = await getDownloadURL(fileRef);
    await createOfferLetterRecord(id, url);
    loadInquiry();
  };

  const handleAdmissionConfirm = async () => {
    await confirmAdmission(id, {
      className: inquiry.classApplied,
      parentName: inquiry.parentName,
      studentName: inquiry.studentName,
    });
    loadInquiry();
  };

  const handleNoteAdd = async (note) => {
    await addNote(id, note);
    loadInquiry();
  };

  const timeline = useMemo(() => inquiry?.timeline || [], [inquiry]);

  if (loading || !inquiry) return <div className="p-6 text-sm">Loading inquiry...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <Head>
        <title>Inquiry profile</title>
      </Head>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Admission Manager Portal</p>
            <h1 className="text-3xl font-semibold text-slate-900">{inquiry.studentName}</h1>
          </div>
          <div className="flex gap-2 text-sm font-semibold text-cardinal">
            <a href="/admission-manager/inquiries" className="hover:underline">
              Back to list
            </a>
            <button onClick={handleSave} className="rounded-xl bg-cardinal px-3 py-2 text-white shadow hover:bg-cardinal/90">
              Save changes
            </button>
          </div>
        </div>

        <InquiryProfileCard inquiry={inquiry} onChange={setInquiry} />

        <div className="grid gap-4 md:grid-cols-2">
          <FollowUpPanel inquiry={inquiry} onSchedule={handleFollowUp} onLog={handleLogAction} />
          <TokenPaymentCard
            payment={inquiry.tokenPayment}
            onReminder={handleTokenReminder}
            onUpdate={handleTokenUpdate}
          />
        </div>

        <VisitPanel inquiryId={id} onCreate={handleVisitCreate} onUpdateStatus={handleVisitStatus} />

        <div className="grid gap-4 md:grid-cols-2">
          <DocumentsPanel inquiry={inquiry} onUpload={handleDocumentUpload} onStatusUpdate={handleDocumentStatus} />
          <NotesPanel notes={inquiry.notes || []} onAdd={handleNoteAdd} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Offer letter</h3>
            <p className="mt-2 text-sm text-slate-600">Generate and store an offer letter for this inquiry.</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleOfferLetter}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Generate PDF
              </button>
              {inquiry.offerLetterURL && (
                <a
                  href={inquiry.offerLetterURL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-cardinal hover:underline"
                >
                  View existing letter
                </a>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Parent portal onboarding</h3>
            <p className="mt-2 text-sm text-slate-600">Confirm admission to trigger parent portal entry.</p>
            <button
              type="button"
              onClick={handleAdmissionConfirm}
              className="mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Confirm Admission
            </button>
          </div>
        </div>

        <Timeline items={timeline} />
      </div>
    </div>
  );
};

export default InquiryProfilePage;
