const PortalLayout = ({ sidebar, children }) => (
  <div className="min-h-screen bg-portal-muted text-slate-900">
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="w-full bg-portal-dark px-6 py-8 text-slate-100 lg:w-1/4">
        <div className="flex h-full flex-col gap-6">{sidebar}</div>
      </aside>
      <main className="flex-1 bg-gradient-to-br from-white via-slate-50 to-portal-muted/80 px-6 py-8">
        {children}
      </main>
    </div>
  </div>
);

export default PortalLayout;
