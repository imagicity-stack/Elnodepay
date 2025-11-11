const StatsGrid = ({ stats }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {stats.map((stat) => (
      <div key={stat.label} className="bg-cardinal text-white rounded-xl shadow p-5">
        <p className="text-sm uppercase tracking-wide text-white/70">{stat.label}</p>
        <p className="text-2xl font-semibold mt-2">{stat.value}</p>
        {stat.helper && <p className="text-xs text-white/80 mt-2">{stat.helper}</p>}
      </div>
    ))}
  </div>
);

export default StatsGrid;
