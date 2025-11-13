import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/parent', label: 'Parent Dashboard' },
  { href: '/accountant', label: 'Accountant Dashboard' }
];

const auditLinks = [
  { href: '/accountant#ledger', label: 'Ledger' },
  { href: '/accountant#expenses', label: 'Expenses' },
  { href: '/accountant#reports', label: 'Reports' }
];

const Header = () => {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const isAccountantPage = router.pathname === '/accountant';
  const auditMenuRef = useRef(null);

  useEffect(() => {
    setIsClient(true);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (auditMenuRef.current && !auditMenuRef.current.contains(event.target)) {
        setIsAuditOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsAuditOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    setIsAuditOpen(false);
  }, [router.asPath]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };

  return (
    <header className="bg-cardinal text-white shadow">
      <div className="max-w-6xl mx-auto flex flex-col gap-4 px-4 py-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Image src="/elnode.png" alt="EL-NODE Pay logo" width={48} height={48} priority />
          <div>
            <h1 className="text-2xl font-semibold">The Elden Heights School – EL-NODE Pay</h1>
            <p className="text-sm text-white/80">Secure fee management for parents and accountants.</p>
          </div>
        </div>
        <nav className="flex items-center gap-4 text-sm font-medium">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-white/80 transition">
              {item.label}
            </Link>
          ))}
          {isClient && isAuthenticated && isAccountantPage && (
            <div className="relative" ref={auditMenuRef}>
              <button
                type="button"
                onClick={() => setIsAuditOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 font-semibold transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-cardinal"
                aria-haspopup="true"
                aria-expanded={isAuditOpen}
                aria-controls="audit-menu"
              >
                Audit
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 transition-transform ${isAuditOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {isAuditOpen && (
                <div
                  id="audit-menu"
                  className="absolute right-0 mt-2 w-44 overflow-hidden rounded-md border border-white/20 bg-cardinal/95 shadow-lg backdrop-blur"
                  role="menu"
                  aria-label="Audit"
                >
                  {auditLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block px-4 py-2 text-sm text-white transition hover:bg-white/10"
                      role="menuitem"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          {isClient && isAuthenticated && (
            <button
              onClick={handleLogout}
              className="bg-white text-cardinal px-4 py-2 rounded-md font-semibold shadow hover:bg-white/90"
            >
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
