const PortalLayout = ({ sidebar, children }) => (
  <div className="min-h-screen bg-portal-muted text-slate-900">
    <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
      <aside className="w-full border-slate-800/80 bg-portal-dark px-6 py-8 text-slate-100 lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:border-r xl:w-96">
        <div className="flex h-full flex-col gap-6">{sidebar}</div>
      </aside>
      <main className="flex-1 bg-gradient-to-br from-white via-slate-50 to-portal-muted/80 px-6 py-8 lg:overflow-y-auto">
        {children}
      </main>
    </div>
  </div>
);

export default PortalLayout;
