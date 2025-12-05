import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { SalarySlip } from '../components/SalaryModule';

const formatCurrency = (value = 0) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const monthLabel = (month, year) => {
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const label = MONTHS[(month || 1) - 1] || 'Month';
  return `${label} ${year || ''}`;
};

const downloadCsvBlob = (rows, fileName) => {
  const headers = Object.keys(rows[0] || {});
  const escapeValue = (value) => {
    if (value === null || value === undefined) return '';
    const raw = String(value);
    if (/[",\n]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };
  const csv = [headers.join(',')]
    .concat(rows.map((row) => headers.map((header) => escapeValue(row[header])).join(',')))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
};

const SalarySlipPreview = ({ open, salary, staff, onClose }) => {
  if (!open || !salary) return null;
  const label = monthLabel(salary.month, salary.year);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-8">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Salary Slip</h3>
            <p className="text-sm text-slate-500">{staff?.fullName} · {label}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                downloadCsvBlob(
                  [
                    {
                      staffId: salary.staffId,
                      month: salary.month,
                      year: salary.year,
                      netPayable: salary.netPayable,
                      grossSalary: salary.grossSalary,
                      totalDeductions: salary.totalDeductions,
                      paymentStatus: salary.paymentStatus,
                    },
                  ],
                  `salary_${salary.staffId}_${salary.year}_${salary.month}.csv`,
                );
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-cardinal px-3 py-1.5 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10"
            >
              Print / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>
        <div className="p-6">
          <SalarySlip staff={staff} salary={salary} structure={salary.allowancesSnapshot} monthLabel={label} />
        </div>
      </div>
    </div>
  );
};

const TeacherDashboard = () => {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [roleState, setRoleState] = useState({ loading: true, error: null });
  const [teacherDoc, setTeacherDoc] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [loginState, setLoginState] = useState({ email: '', password: '', error: null, loading: false });
  const [slipContext, setSlipContext] = useState({ open: false, salary: null });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setRoleState({ loading: false, error: null });
        setAuthChecked(true);
        return;
      }

      // Wait for the Firestore role document before deciding access. No custom claims are used.
      setRoleState({ loading: true, error: null });

      try {
        // Prefer UID-matched document but also support authUid lookups so teachers aren’t blocked if IDs differ.
        const directDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const directRole = directDoc.exists() ? (directDoc.data()?.role || '').toString().toLowerCase().trim() : '';

        let role = directRole;
        let resolvedDocId = directDoc.id;

        if (!directRole) {
          const altQuery = query(collection(db, 'users'), where('authUid', '==', currentUser.uid), limit(1));
          const altSnap = await getDocs(altQuery);
          const altDoc = altSnap.docs[0];
          if (altDoc) {
            role = (altDoc.data()?.role || '').toString().toLowerCase().trim();
            resolvedDocId = altDoc.id;
          }
        }

        if (role === 'teacher') {
          setUser(currentUser);
          setRoleState({ loading: false, error: null, docId: resolvedDocId });
          setAuthChecked(true);
          return;
        }

        setUser(null);
        setRoleState({ loading: false, error: 'Role not assigned. Contact administrator.' });
        await signOut(auth);
        router.push('/unauthorized');
      } catch (error) {
        console.error('Unable to verify teacher role', error);
        setUser(null);
        setRoleState({ loading: false, error: 'Unable to verify role. Please try again.' });
      } finally {
        setAuthChecked(true);
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    const loadStaff = async () => {
      if (!user) return;
      const staffQuery = query(collection(db, 'staff'), where('authUid', '==', user.uid));
      const staffSnap = await getDocs(staffQuery);
      const docRef = staffSnap.docs[0];
      if (docRef) {
        setTeacherDoc({ id: docRef.id, ...docRef.data() });
      }
    };
    loadStaff();
  }, [user]);

  useEffect(() => {
    const loadAttendance = async () => {
      if (!teacherDoc?.staffId) return;
      const attendanceQuery = query(
        collection(db, 'staffAttendance'),
        where('staffId', '==', teacherDoc.staffId),
        orderBy('year', 'desc'),
        orderBy('month', 'desc'),
      );
      const snapshot = await getDocs(attendanceQuery);
      const rows = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setAttendance(rows);
    };
    loadAttendance();
  }, [teacherDoc]);

  useEffect(() => {
    const loadSalaryHistory = async () => {
      if (!teacherDoc?.staffId) return;
      const salaryQuery = query(
        collection(db, 'salaries'),
        where('staffId', '==', teacherDoc.staffId),
        orderBy('year', 'desc'),
        orderBy('month', 'desc'),
      );
      const snapshot = await getDocs(salaryQuery);
      setSalaryHistory(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    };
    loadSalaryHistory();
  }, [teacherDoc]);

  const attendanceSummary = useMemo(() => attendance[0] || null, [attendance]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await signInWithEmailAndPassword(auth, loginState.email, loginState.password);
    } catch (error) {
      console.error('Teacher login failed', error);
      setLoginState((prev) => ({ ...prev, error: 'Unable to sign in. Check credentials.', loading: false }));
      return;
    }
    setLoginState((prev) => ({ ...prev, loading: false }));
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/');
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-cardinal">
        <Head>
          <title>Teacher Portal</title>
        </Head>
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-cardinal/40 border-t-cardinal" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Head>
          <title>Teacher Login · EL-NODE Pay</title>
        </Head>
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <Image src="/elnode.png" alt="EL-NODE" width={48} height={48} />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Teacher Login</h1>
              <p className="text-sm text-slate-500">Sign in to view your payroll and attendance.</p>
            </div>
          </div>
          {roleState.error && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {roleState.error}
            </div>
          )}
          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <label className="block text-sm font-semibold text-slate-700">
              Email
              <input
                type="email"
                value={loginState.email}
                onChange={(event) => setLoginState((prev) => ({ ...prev, email: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                required
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Password
              <input
                type="password"
                value={loginState.password}
                onChange={(event) => setLoginState((prev) => ({ ...prev, password: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                required
              />
            </label>
            {loginState.error && <p className="text-sm text-rose-600">{loginState.error}</p>}
            <button
              type="submit"
              disabled={loginState.loading}
              className="w-full rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed"
            >
              {loginState.loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Head>
        <title>Teacher Dashboard · EL-NODE Pay</title>
      </Head>
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Image src="/elnode.png" alt="EL-NODE Pay" width={48} height={48} />
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Teacher Dashboard</h1>
              <p className="text-sm text-slate-600">View your profile, attendance, and salary slips.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-cardinal/10 px-3 py-1 text-xs font-semibold text-cardinal">
              Teacher access
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Profile</h3>
            <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Name</p>
                <p className="font-semibold text-slate-900">{teacherDoc?.fullName || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Staff ID</p>
                <p className="font-semibold text-slate-900">{teacherDoc?.staffId || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Category</p>
                <p className="font-semibold text-slate-900">{teacherDoc?.designationCategory || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Sub Role</p>
                <p className="font-semibold text-slate-900">{teacherDoc?.subRole || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Employment</p>
                <p className="font-semibold text-slate-900">{teacherDoc?.employmentType || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Date of Joining</p>
                <p className="font-semibold text-slate-900">
                  {teacherDoc?.dateOfJoining?.toDate
                    ? teacherDoc.dateOfJoining.toDate().toLocaleDateString('en-IN')
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Attendance</h3>
            {attendanceSummary ? (
              <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Working days</p>
                  <p className="text-lg font-semibold text-slate-900">{attendanceSummary.totalWorkingDays}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Present days</p>
                  <p className="text-lg font-semibold text-slate-900">{attendanceSummary.presentDays}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Approved leaves</p>
                  <p className="text-lg font-semibold text-slate-900">{attendanceSummary.approvedLeaves}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Unpaid leaves</p>
                  <p className="text-lg font-semibold text-slate-900">{attendanceSummary.unpaidLeaves}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Attendance for this month isn’t available yet.</p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Salary history</h3>
              <p className="text-sm text-slate-500">View your processed salaries and download slips.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Month', 'Gross', 'Deductions', 'Net', 'Status', 'Paid On', 'Action'].map((heading) => (
                    <th key={heading} className="px-4 py-2 text-left font-semibold text-slate-700">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {salaryHistory.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 text-slate-700">{monthLabel(row.month, row.year)}</td>
                    <td className="px-4 py-2 text-slate-700">{formatCurrency(row.grossSalary)}</td>
                    <td className="px-4 py-2 text-slate-700">{formatCurrency(row.totalDeductions)}</td>
                    <td className="px-4 py-2 font-semibold text-emerald-700">{formatCurrency(row.netPayable)}</td>
                    <td className="px-4 py-2 text-slate-700">{row.paymentStatus}</td>
                    <td className="px-4 py-2 text-slate-700">
                      {row.processedAt?.toDate ? row.processedAt.toDate().toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setSlipContext({ open: true, salary: row })}
                        className="rounded-lg border border-cardinal px-3 py-1.5 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
                      >
                        View Slip
                      </button>
                    </td>
                  </tr>
                ))}
                {!salaryHistory.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                      No salary entries available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <SalarySlipPreview
        open={slipContext.open}
        salary={slipContext.salary}
        staff={teacherDoc}
        onClose={() => setSlipContext({ open: false, salary: null })}
      />
    </div>
  );
};

export default TeacherDashboard;
