import { useMemo } from 'react';

const formatDate = (value) => {
  if (!value) return '—';
  const date = value?.toDate?.() ? value.toDate() : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-IN') : '—';
};

const FollowUpPanel = ({ inquiry, onSchedule, onLog }) => {
  const overdue = useMemo(() => {
    if (!inquiry?.followUpDate) return false;
    const date = inquiry.followUpDate?.toDate?.() ? inquiry.followUpDate.toDate() : new Date(inquiry.followUpDate);
    return date < new Date();
  }, [inquiry]);

  const quickLog = (type) => {
    onLog?.({ type, label: `${type} logged` });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const form = event.target;
    const date = form.date.value;
    const status = form.status.value;
    onSchedule?.({ date, status });
    form.reset();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Follow-up</h3>
        {overdue && <span className="text-sm font-semibold text-cardinal">Overdue</span>}
      </div>
      <p className="mt-2 text-sm text-slate-600">Next follow-up: {formatDate(inquiry?.followUpDate)}</p>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-slate-500">Follow-up date</label>
          <input
            name="date"
            type="datetime-local"
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Status</label>
          <select
            name="status"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            <option value="pending">Pending</option>
            <option value="done">Completed</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        <div className="md:col-span-2 flex flex-wrap gap-2">
          {['WhatsApp', 'SMS', 'Call'].map((action) => (
            <button
              type="button"
              key={action}
              onClick={() => quickLog(action.toLowerCase())}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
            >
              Log {action}
            </button>
          ))}
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            className="w-full rounded-xl bg-cardinal px-3 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90"
          >
            Save reminder
          </button>
        </div>
      </form>
    </div>
  );
};

export default FollowUpPanel;
