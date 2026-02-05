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

const PORTAL_CARDS = [
  {
    id: 'finance',
    title: 'Finance & Fees',
    copy: 'Reconcile dues, fee cycles, vouchers, and receivables in one glance.',
    tone: 'from-cardinal/90 to-rose-500',
  },
  {
    id: 'people',
    title: 'People Ops',
    copy: 'Payroll, attendance, and communication streams tailored for every staff role.',
    tone: 'from-indigo-600 to-sky-500',
  },
  {
    id: 'parents',
    title: 'Parent Desk',
    copy: 'Statements, reminders, and academic milestones packaged for families.',
    tone: 'from-emerald-500 to-lime-400',
  },
];

const OPERATIONS = [
  { label: 'Collections', detail: 'Fee cycles, smart reminders, ledgers', accent: 'bg-cardinal/10 text-cardinal' },
  { label: 'Governance', detail: 'Audit trails, approvals, bulk actions', accent: 'bg-indigo-50 text-indigo-700' },
  { label: 'Engagement', detail: 'Announcements, receipts, exports', accent: 'bg-amber-50 text-amber-700' },
  { label: 'Payouts', detail: 'Payroll, vouchers, settlements', accent: 'bg-emerald-50 text-emerald-700' },
];

const FORM_TABS = [
  { id: 'signin', label: 'Secure sign in' },
  { id: 'updates', label: "What's new" },
];

const UPDATE_TIMELINE = [
  {
    title: 'Progressive refresh',
    description: 'New sectional layout, responsive grids, and elevated glass cards for every portal.',
    badge: 'UI refresh',
    tone: 'bg-indigo-50 text-indigo-700',
  },
  {
    title: 'Adaptive access',
    description: 'Improved mobile-first spacing with persistent tabs and contextual actions.',
    badge: 'PWA ready',
    tone: 'bg-emerald-50 text-emerald-700',
  },
  {
    title: 'Confident onboarding',
    description: 'Role-driven redirects and quick links to support keep the journey frictionless.',
    badge: 'Experience',
    tone: 'bg-amber-50 text-amber-700',
  },
];

const LoginPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');

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

        if (role === 'staff') {
          await router.replace('/staff');
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

        if (role === 'super_admin') {
          await router.replace('/super_admin');
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
      <div className="relative min-h-screen bg-gradient-to-br from-rose-50 via-white to-slate-50 flex items-center justify-center px-4 font-poppins overflow-hidden">
        <Head>
          <title>EL-NODE Login</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
            rel="stylesheet"
          />
        </Head>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(163,31,54,0.08),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(79,70,229,0.08),transparent_25%)]" aria-hidden="true" />
        <div className="relative flex flex-col items-center gap-4 text-cardinal">
          <div className="glass-panel rounded-2xl px-6 py-4 text-center">
            {renderSpinner('h-8 w-8', 'border-cardinal')}
            <p className="mt-3 text-sm font-medium text-slate-700">Preparing your dashboard…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-white via-rose-50/40 to-slate-50 font-poppins text-slate-800">
      <Head>
        <title>EL-NODE Login</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(163,31,54,0.14),transparent_26%),radial-gradient(circle_at_84%_12%,rgba(79,70,229,0.12),transparent_24%),linear-gradient(120deg,rgba(255,255,255,0.7),rgba(255,255,255,0.94))]" aria-hidden="true" />
      <div className="absolute left-6 top-6 z-10 flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 shadow-lg backdrop-blur">
        <Image src="/elnode.png" alt="EL-NODE logo" width={40} height={40} priority />
        <div className="leading-tight">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cardinal">EL-NODE</p>
          <p className="text-[11px] font-medium text-slate-600">Mount Litera Zee School ERP</p>
        </div>
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-4 pb-12 pt-24 lg:px-10 xl:px-0">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/80 bg-white/90 px-4 py-2 shadow-md backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-cardinal" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cardinal/90">Premium access</p>
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
                Elite control for every school portal.
              </h1>
              <p className="max-w-2xl text-base text-slate-600">
                Navigate admissions, finance, payroll, and parent journeys with a calm, layered workspace. Clean tabs,
                colour-coded sections, and responsive spacing keep your teams focused on what matters.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {PORTAL_CARDS.map((card) => (
                <div
                  key={card.id}
                  className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/80 p-4 shadow-lg backdrop-blur transition hover:-translate-y-1 hover:shadow-2xl"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.tone} opacity-10`} aria-hidden="true" />
                  <div className="relative space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-cardinal/80">{card.title}</p>
                    <p className="text-sm leading-relaxed text-slate-700">{card.copy}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl backdrop-blur-lg lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operational suites</p>
                <h2 className="text-xl font-semibold text-slate-900">Tabs, sub-sections, and calm summaries</h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  Each portal now lands in curated sections so you can glide between collections, payouts, communication,
                  and policy without visual noise. Cards align in adaptive columns for mobile PWA screens.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {OPERATIONS.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-inner">
                    <span className={`mb-2 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${item.accent}`}>
                      {item.label}
                    </span>
                    <p className="text-sm font-medium text-slate-800">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="relative">
            <div className="absolute inset-0 -z-10 rounded-[28px] bg-gradient-to-br from-white via-white to-rose-50/60 shadow-2xl" aria-hidden="true" />
            <div className="flex h-full flex-col gap-6 rounded-[28px] border border-white/80 bg-white/90 p-2 shadow-xl backdrop-blur-lg">
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-cardinal/10 via-white to-indigo-50 px-4 py-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cardinal">Unified access</p>
                  <p className="text-sm text-slate-600">Sign in once to flow across Accountant, Staff, Parent, or Admissions.</p>
                </div>
                <div className="hidden rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-cardinal shadow-sm sm:block">
                  PWA-ready
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-100 bg-white/90 p-3 shadow-inner">
                <div className="flex rounded-xl bg-slate-50 p-1 text-sm font-semibold text-slate-600">
                  {FORM_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 rounded-lg px-3 py-2 transition ${
                        activeTab === tab.id
                          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-cardinal/20'
                          : 'hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'signin' ? (
                  <form className="space-y-5 px-1 py-5" onSubmit={handleSubmit}>
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-semibold text-slate-800">
                        Email address
                      </label>
                      <input
                        id="email"
                        type="email"
                        required
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-inner focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/30"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="password" className="text-sm font-semibold text-slate-800">
                        Password
                      </label>
                      <input
                        id="password"
                        type="password"
                        required
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-inner focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/30"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-slate-700">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(event) => setRememberMe(event.target.checked)}
                          className="h-4 w-4 rounded border-cardinal/40 text-cardinal focus:ring-cardinal"
                        />
                        Keep me signed in
                      </label>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">SAML Secured</span>
                    </div>
                    {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-xl bg-gradient-to-r from-cardinal to-cardinal/90 py-3 text-sm font-semibold text-white shadow-lg shadow-cardinal/25 transition hover:-translate-y-0.5 hover:shadow-xl focus:ring-2 focus:ring-cardinal/40 disabled:cursor-not-allowed disabled:opacity-90"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          {renderSpinner('h-4 w-4')}
                          Signing in…
                        </span>
                      ) : (
                        'Access your workspace'
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4 px-1 py-5">
                    {UPDATE_TIMELINE.map((item) => (
                      <div
                        key={item.title}
                        className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-inner transition hover:border-cardinal/30"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${item.tone}`}>{item.badge}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                      </div>
                    ))}
                    <p className="rounded-xl bg-white px-4 py-3 text-xs font-medium text-slate-500">
                      Optimised for modern browsers and installable as a PWA so teams can review tabs, subsections, and
                      reports on the go.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <footer className="relative rounded-3xl border border-white/70 bg-white/90 p-6 shadow-lg backdrop-blur-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <p className="font-semibold text-slate-800">Always-on uptime</p>
              <span className="text-slate-500">Multi-tab workflows tuned for mobile and desktop.</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-cardinal">
              <span className="h-6 w-6 rounded-full bg-cardinal/10 text-center leading-6">→</span>
              Experience the elite, calm workspace for every portal.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LoginPage;
