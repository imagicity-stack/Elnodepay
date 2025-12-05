import { useEffect, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const LoginPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const remembered = window.localStorage.getItem('elnode-remember-me');
      if (remembered === 'true') {
        setRememberMe(true);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    const handleRoleRedirect = async (firebaseUser) => {
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (!active) return;

        if (!userDoc.exists()) {
          alert('Role not assigned.');
          await signOut(auth);
          setCheckingAuth(false);
          return;
        }

        const { role } = userDoc.data();

        if (role === 'accountant') {
          await router.replace('/accountant');
          return;
        }

        if (role === 'parent') {
          await router.replace('/parent');
          return;
        }

        if (role === 'admission_manager') {
          await router.replace('/admission-manager');
          return;
        }

        alert('Role not assigned.');
        await signOut(auth);
        setCheckingAuth(false);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setError('Unable to verify account. Please try again.');
        setCheckingAuth(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) {
        return;
      }

      if (!user) {
        setCheckingAuth(false);
        return;
      }

      setCheckingAuth(true);
      handleRoleRedirect(user);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
      await setPersistence(auth, persistence);
      if (typeof window !== 'undefined') {
        if (rememberMe) {
          window.localStorage.setItem('elnode-remember-me', 'true');
          window.sessionStorage.removeItem('elnode-remember-me');
        } else {
          window.sessionStorage.setItem('elnode-remember-me', 'false');
          window.localStorage.removeItem('elnode-remember-me');
        }
      }
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const message = err?.message?.replace('Firebase: ', '') || 'Login failed. Please check your credentials.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const renderSpinner = (size = 'h-5 w-5', color = 'border-white/60') => (
    <span
      className={`inline-block ${size} animate-spin rounded-full border-2 border-solid ${color} border-t-transparent`}
      aria-hidden="true"
    />
  );

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4 font-poppins">
        <Head>
          <title>EL-NODE Login</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
            rel="stylesheet"
          />
        </Head>
        <div className="flex flex-col items-center gap-4 text-cardinal">
          {renderSpinner('h-8 w-8', 'border-cardinal')}
          <p className="text-sm font-medium">Preparing your dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-white flex items-center justify-center px-4 py-16 font-poppins text-slate-800">
      <Head>
        <title>EL-NODE Login</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div className="absolute left-6 top-6">
        <Image src="/elnode.png" alt="EL-NODE logo" width={48} height={48} priority />
      </div>
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-semibold text-cardinal">EL-NODE</h1>
          <p className="mt-2 text-sm text-slate-500">ERP for Mount Litera Zee School</p>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue.</p>
        </div>
        <form className="space-y-5 rounded-3xl border border-cardinal/20 bg-cardinal/5 p-6 shadow-xl" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-cardinal">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full rounded-xl border border-cardinal/20 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/40"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-cardinal">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="w-full rounded-xl border border-cardinal/20 px-4 py-3 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/40"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-cardinal">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-4 w-4 rounded border-cardinal/40 text-cardinal focus:ring-cardinal"
            />
            Keep me signed in
          </label>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-cardinal py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-90"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                {renderSpinner('h-4 w-4')}
                Signing in…
              </span>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
