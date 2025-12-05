import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { bulkUpdateStatus, exportInquiries, fetchInquiries, fetchUserRole, recordBulkTags } from '../../lib/admissionService';

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

const BulkActionsPage = () => {
  const { loading } = useAdmissionGuard();
  const [inquiries, setInquiries] = useState([]);
  const [selected, setSelected] = useState([]);
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState('follow_up');

  useEffect(() => {
    fetchInquiries().then(setInquiries);
  }, []);

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleExport = async () => {
    const data = await exportInquiries();
    const csvHeader = 'ID,Parent,Phone,Class,Status,Lead source,Budget\n';
    const rows = data
      .map((row) => `${row.id},${row.parentName},${row.phone},${row.classApplied},${row.status},${row.leadSource},${row.budget}`)
      .join('\n');
    const blob = new Blob([csvHeader + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inquiries.csv';
    link.click();
  };

  const handleTag = async () => {
    const tagsList = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    await recordBulkTags(selected, tagsList);
  };

  const handleStatus = async () => {
    await bulkUpdateStatus(selected, status);
  };

  if (loading) return <div className="p-6 text-sm">Checking permissions...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <Head>
        <title>Bulk actions</title>
      </Head>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Admission Manager Portal</p>
            <h1 className="text-3xl font-semibold text-slate-900">Bulk actions</h1>
          </div>
          <Link href="/admission-manager" className="text-sm font-semibold text-cardinal hover:underline">
            Back to dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Select leads</h3>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Export to CSV
            </button>
          </div>
          <div className="mt-3 max-h-64 overflow-y-auto space-y-2 text-sm">
            {inquiries.map((item) => (
              <label key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  className="h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal"
                />
                <div>
                  <p className="font-semibold text-slate-900">{item.studentName}</p>
                  <p className="text-xs text-slate-500">Parent: {item.parentName}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Bulk tags</label>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              />
              <button
                type="button"
                onClick={handleTag}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Apply tags
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Bulk status update</label>
            <div className="mt-2 flex gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              >
                {['new', 'contacted', 'follow_up', 'visit_scheduled', 'token_paid', 'admitted', 'closed'].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleStatus}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Update status
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">WhatsApp integration</p>
            <p>Placeholder button here – integrate provider API when credentials are ready.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkActionsPage;
