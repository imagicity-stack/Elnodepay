import { useState } from 'react';

const STATUS_OPTIONS = ['new', 'contacted', 'follow_up', 'hot', 'warm', 'cold', 'converted', 'visit_scheduled', 'token_paid', 'admitted', 'closed'];

const Filters = ({ onChange }) => {
  const [filters, setFilters] = useState({
    classApplied: '',
    leadSource: '',
    status: 'all',
    location: '',
    followUpDueToday: false,
    dateFrom: '',
    dateTo: '',
    budget: '',
  });

  const handleChange = (key, value) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    onChange?.(updated);
  };

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <label className="text-xs font-semibold text-slate-500">Class applied</label>
          <input
            type="text"
            value={filters.classApplied}
            onChange={(e) => handleChange('classApplied', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="e.g. Grade 1"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Lead source</label>
          <input
            type="text"
            value={filters.leadSource}
            onChange={(e) => handleChange('leadSource', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="Campaign / referral"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Status</label>
          <select
            value={filters.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            <option value="all">All</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Location</label>
          <input
            type="text"
            value={filters.location}
            onChange={(e) => handleChange('location', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="City / area"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Date from</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Date to</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Budget tags</label>
          <input
            type="text"
            value={filters.budget}
            onChange={(e) => handleChange('budget', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="₹50k-₹1L"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={filters.followUpDueToday}
              onChange={(e) => handleChange('followUpDueToday', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal"
            />
            Follow-up due today
          </label>
        </div>
      </div>
    </div>
  );
};

export default Filters;
