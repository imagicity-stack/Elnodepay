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
