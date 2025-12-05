const InfoRow = ({ label, value }) => (
  <div className="flex justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="font-semibold text-slate-900">{value || '—'}</span>
  </div>
);

const InquiryProfileCard = ({ inquiry, onChange }) => {
  if (!inquiry) return null;
  const handleChange = (key, value) => {
    onChange?.({ ...inquiry, [key]: value });
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{inquiry.studentName}</h2>
          <p className="text-sm text-slate-500">Parent: {inquiry.parentName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={inquiry.status || 'new'}
            onChange={(e) => handleChange('status', e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            {['new', 'contacted', 'follow_up', 'visit_scheduled', 'token_paid', 'admitted', 'closed'].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InfoRow label="Contact" value={inquiry.phone} />
        <InfoRow label="Email" value={inquiry.email} />
        <InfoRow label="Class applied" value={inquiry.classApplied} />
        <InfoRow label="Lead source" value={inquiry.leadSource} />
        <InfoRow label="Location" value={inquiry.location} />
        <InfoRow label="Assigned counsellor" value={inquiry.assignedCounsellor} />
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-slate-500">Notes</label>
          <textarea
            value={inquiry.notesSummary || ''}
            onChange={(e) => handleChange('notesSummary', e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            rows={3}
            placeholder="Add context for this inquiry"
          />
        </div>
      </div>
    </div>
  );
};

export default InquiryProfileCard;
