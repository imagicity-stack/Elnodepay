const Card = ({ title, actions, children }) => (
  <section className="bg-white shadow-lg rounded-xl border border-cardinal/10 overflow-hidden">
    <header className="bg-cardinal/10 px-6 py-4 flex justify-between items-center">
      <h2 className="text-lg font-semibold text-cardinal">{title}</h2>
      {actions && <div className="flex gap-3">{actions}</div>}
    </header>
    <div className="px-6 py-6 text-slate-700 space-y-4">{children}</div>
  </section>
);

export default Card;
