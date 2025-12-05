const PerformanceCard = ({ entry }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-slate-900">{entry.counsellor}</h4>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
          Leads: {entry.leads}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-700">
        <div>
          <p className="font-semibold text-slate-900">Calls</p>
          <p>{entry.calls}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Conversions</p>
          <p>{entry.conversions}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Pending follow-ups</p>
          <p>{entry.pendingFollowUps}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Response time</p>
          <p>{entry.responseTime ? `${entry.responseTime} mins` : '—'}</p>
        </div>
      </div>
    </div>
  );
};

export default PerformanceCard;
