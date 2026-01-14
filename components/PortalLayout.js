import { useState } from 'react';

const PortalLayout = ({ sidebar, children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const sidebarContent = <div className="flex h-full flex-col gap-6">{sidebar}</div>;

  return (
    <div className="min-h-screen bg-portal-muted text-slate-900">
      <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
        <aside className="hidden w-full border-slate-800/80 bg-portal-dark px-6 py-8 text-slate-100 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-80 lg:border-r xl:w-96">
          {sidebarContent}
        </aside>
        <main className="flex-1 bg-gradient-to-br from-white via-slate-50 to-portal-muted/80 px-6 py-8 lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-4 lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              aria-label="Open portal menu"
              aria-expanded={isMobileMenuOpen}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
              Menu
            </button>
          </div>
          <div className="mt-6 lg:mt-0">{children}</div>
        </main>
      </div>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity lg:hidden ${
          isMobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        role="presentation"
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-portal-dark px-6 py-8 text-slate-100 shadow-2xl transition-transform lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Portal menu"
        aria-hidden={!isMobileMenuOpen}
        onClickCapture={(event) => {
          if (event.target.closest('a, button')) {
            setIsMobileMenuOpen(false);
          }
        }}
      >
        <div className="mb-6 flex items-center justify-between">
          <span className="text-lg font-semibold text-white">Menu</span>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Close menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {sidebarContent}
      </aside>
    </div>
  );
};

export default PortalLayout;
