import { useState } from 'react';

const DocumentRow = ({ label, status, onStatusChange }) => (
  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
    <span className="text-sm font-semibold text-slate-800">{label}</span>
    <select
      value={status || 'pending'}
      onChange={(e) => onStatusChange(e.target.value)}
      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
    >
      <option value="pending">Pending</option>
      <option value="verified">Verified</option>
      <option value="rejected">Rejected</option>
    </select>
  </div>
);

const DocumentsPanel = ({ inquiry, onUpload, onStatusUpdate }) => {
  const [uploading, setUploading] = useState(false);
  const statuses = inquiry?.documentStatuses || {};

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await onUpload?.(file);
    setUploading(false);
  };

  const updateStatus = (key, value) => {
    onStatusUpdate?.({ ...statuses, [key]: value });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Documents</h3>
        <label className="cursor-pointer rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          {uploading ? 'Uploading...' : 'Upload'}
          <input type="file" className="hidden" onChange={handleUpload} />
        </label>
      </div>
      <div className="mt-4 space-y-2">
        <DocumentRow label="Aadhaar" status={statuses.aadhaarStatus} onStatusChange={(value) => updateStatus('aadhaarStatus', value)} />
        <DocumentRow label="Birth certificate" status={statuses.birthCertStatus} onStatusChange={(value) => updateStatus('birthCertStatus', value)} />
        <DocumentRow label="Transfer certificate" status={statuses.tcStatus} onStatusChange={(value) => updateStatus('tcStatus', value)} />
      </div>
      <textarea
        value={statuses.remarks || ''}
        onChange={(e) => updateStatus('remarks', e.target.value)}
        className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
        placeholder="Remarks"
      />
    </div>
  );
};

export default DocumentsPanel;
