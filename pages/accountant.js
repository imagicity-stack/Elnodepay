import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AccountantDashboard = () => {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const fetchStudents = async () => {
      if (!active) return;
      setStudentsLoading(true);
      setError('');

      try {
        const snapshot = await getDocs(collection(db, 'students'));
        if (!active) return;

        const studentRecords = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setStudents(studentRecords);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setError('Unable to load student data. Please try again later.');
        setStudents([]);
      } finally {
        if (active) {
          setStudentsLoading(false);
        }
      }
    };

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

          if (role === 'accountant') {
            setCheckingAuth(false);
            fetchStudents();
            return;
          }

          if (role === 'parent') {
            router.replace('/parent');
            return;
          }

          alert('Role not assigned.');
          await signOut(auth);
          setCheckingAuth(false);
          router.replace('/');
        } catch (err) {
          console.error(err);
          if (!active) return;
          setError('Unable to verify your access. Please try again.');
          setCheckingAuth(false);
          setStudentsLoading(false);
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
          <title>Accountant Dashboard</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
            rel="stylesheet"
          />
        </Head>
        <div className="flex flex-col items-center gap-4">
          {renderSpinner()}
          <p className="text-sm font-medium">Checking account access…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-12 font-poppins text-slate-800">
      <Head>
        <title>Accountant Dashboard</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-cardinal/20 bg-cardinal/5 p-8 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-cardinal">Accountant Dashboard</h1>
            <p className="mt-2 text-sm text-slate-600">
              Review student balances and upcoming payment dates from the central ledger.
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
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-cardinal">Student Accounts</h2>
            {studentsLoading && renderSpinner()}
          </div>
          {error && <p className="mb-4 text-sm font-medium text-red-600">{error}</p>}
          {!studentsLoading && students.length === 0 ? (
            <p className="text-sm text-slate-600">No student data found.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {students.map((student) => (
                <article
                  key={student.id}
                  className="rounded-2xl border border-cardinal/15 bg-cardinal/5 p-6 shadow-sm transition hover:border-cardinal/40"
                >
                  <h3 className="text-lg font-semibold text-cardinal">{student.name || student.student_name || 'Student'}</h3>
                  <dl className="mt-4 space-y-2 text-sm text-slate-600">
                    <div className="flex items-center justify-between">
                      <dt className="font-medium text-cardinal">Total Due</dt>
                      <dd>₹{Number(student.total_due || 0).toLocaleString('en-IN')}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="font-medium text-cardinal">Next Due Date</dt>
                      <dd>{student.next_due_date || 'Not set'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AccountantDashboard;
