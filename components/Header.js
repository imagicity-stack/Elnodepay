import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/parent', label: 'Parent Dashboard' },
  { href: '/accountant', label: 'Accountant Dashboard' }
];

const Header = () => {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
    setIsMobileMenuOpen(false);
  };

  const handleMobileNavigate = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="relative overflow-hidden bg-gradient-to-r from-cardinal to-cardinal/90 text-white shadow-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.12),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_30%)]" aria-hidden="true" />
      <div className="relative max-w-6xl mx-auto flex flex-col gap-4 px-4 py-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-3">
          <Image src="/elnode.png" alt="EL-NODE Pay logo" width={48} height={48} priority />
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">The Elden Heights School – EL-NODE Pay</h1>
            <p className="text-sm text-white/80">Secure fee management for parents and accountants.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/10 p-2 text-white transition hover:bg-white/20 md:hidden"
            aria-label="Open menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg
              width="24"
              height="24"
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
          </button>
        </div>
        <nav className="hidden items-center gap-2 text-sm font-medium md:flex">
          {navItems.map((item) => {
            const isActive = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 transition ${
                  isActive ? 'bg-white/20 text-white shadow-inner' : 'hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {isClient && isAuthenticated && (
            <button
              onClick={handleLogout}
              className="rounded-full bg-white px-4 py-2 font-semibold text-cardinal shadow-lg shadow-cardinal/20 transition hover:-translate-y-0.5 hover:bg-white/90"
            >
              Sign out
            </button>
          )}
        </nav>
      </div>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity md:hidden ${
          isMobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        role="presentation"
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white text-slate-900 shadow-2xl transition-transform md:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Mobile menu"
        aria-hidden={!isMobileMenuOpen}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <span className="text-lg font-semibold text-slate-900">Menu</span>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-slate-50"
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
        <nav className="flex flex-col gap-2 px-5 py-6 text-base font-medium">
          {navItems.map((item) => {
            const isActive = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleMobileNavigate}
                className={`rounded-xl px-4 py-3 transition ${
                  isActive ? 'bg-cardinal/10 text-cardinal' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {isClient && isAuthenticated && (
            <button
              onClick={handleLogout}
              className="mt-2 rounded-xl bg-cardinal px-4 py-3 text-left font-semibold text-white shadow-md transition hover:bg-cardinal/90"
            >
              Sign out
            </button>
          )}
        </nav>
      </aside>
    </header>
  );
};

export default Header;
