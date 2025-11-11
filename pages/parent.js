import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const ParentDashboard = () => {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) {
        return;
      }

      if (!user) {
        setCheckingAuth(false);
        router.replace('/');
        return;
      }

      (async () => {
        try {
          const profileSnap = await getDoc(doc(db, 'users', user.uid));
          if (!active) return;

          if (!profileSnap.exists()) {
            alert('Role not assigned.');
            await signOut(auth);
            setCheckingAuth(false);
            router.replace('/');
            return;
          }

          const { role } = profileSnap.data();

          if (role === 'parent') {
            setCheckingAuth(false);
            return;
          }

          if (role === 'accountant') {
            router.replace('/accountant');
            return;
          }

          alert('Role not assigned.');
          await signOut(auth);
          setCheckingAuth(false);
          router.replace('/');
        } catch (err) {
          console.error(err);
          if (!active) return;
          setCheckingAuth(false);
        }
      })();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/');
  };

  const renderSpinner = () => (
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-cardinal/60 border-t-transparent" aria-hidden="true" />
  );

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4 font-poppins text-cardinal">
        <Head>
          <title>Parent Dashboard</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
            rel="stylesheet"
          />
        </Head>
        <div className="flex flex-col items-center gap-4">
          {renderSpinner()}
          <p className="text-sm font-medium">Loading your portal…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-12 font-poppins text-slate-800">
      <Head>
        <title>Parent Dashboard</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-cardinal/20 bg-cardinal/5 p-8 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-cardinal">Welcome</h1>
            <p className="mt-2 text-sm text-slate-600">
              Welcome to your EL-NODE Pay parent portal.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center justify-center rounded-xl border border-cardinal bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-cardinal/90"
          >
            Sign out
          </button>
        </header>

        <section className="rounded-3xl border border-cardinal/15 bg-white p-8 shadow-lg">
          <h2 className="text-xl font-semibold text-cardinal">Your Payments at a Glance</h2>
          <p className="mt-4 text-sm text-slate-600">
            Future updates will display your student&apos;s payment history, outstanding balances, and secure payment
            actions. Stay tuned for the latest enhancements to EL-NODE Pay.
          </p>
        </section>
      </div>
    </div>
  );
};

export default ParentDashboard;
