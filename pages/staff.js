import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { SalarySlip } from '../components/SalaryModule';
import { renderPdfFromHtml } from '../lib/pdf';

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

const buildSalarySlipContent = (salary, staff, label) => {
  const allowances = salary?.allowancesSnapshot || {};
  const deductions = salary?.deductionsSnapshot || {};
  const otherAllowances = Array.isArray(allowances.otherAllowances) ? allowances.otherAllowances : [];
  const otherDeductions = Array.isArray(deductions.otherDeductions) ? deductions.otherDeductions : [];
  const extraPayments = Array.isArray(salary?.extraPayments) ? salary.extraPayments : [];

  const renderListRows = (items = []) =>
    items
      .map(
        (item) =>
          `<tr><td style="padding:8px 10px; color:#111827;">${item.label || 'Item'}</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(item.amount)}</td></tr>`,
      )
      .join('');

  return `
    <section>
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <p style="margin:0; color:#6b7280; font-size:12px;">Salary Slip</p>
          <h1 style="margin:2px 0 6px; font-size:22px; color:#8c191b;">${staff?.fullName || 'Staff Member'}</h1>
          <p style="margin:0; color:#374151; font-size:13px;">Staff ID: ${staff?.staffId || '-'}</p>
          <p style="margin:2px 0 0; color:#4b5563; font-size:13px;">${staff?.designationCategory || ''} ${staff?.subRole ? `· ${staff.subRole}` : ''}</p>
        </div>
        <div style="text-align:right;">
          <p style="margin:0; font-weight:700; color:#0f172a;">${label}</p>
          <p style="margin:4px 0 0; color:#6b7280; font-size:12px;">Generated on ${new Date().toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin-top:14px;">
        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:12px 14px; background:#f8fafc;">
          <h2 style="margin:0 0 10px; font-size:16px; color:#0f172a;">Earnings</h2>
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <tbody>
              <tr><td style="padding:8px 10px; color:#111827;">Basic Pay</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(allowances.basicPay)}</td></tr>
              <tr><td style="padding:8px 10px; color:#111827;">HRA</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(allowances.hra)}</td></tr>
              <tr><td style="padding:8px 10px; color:#111827;">DA</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(allowances.da)}</td></tr>
              <tr><td style="padding:8px 10px; color:#111827;">Special Allowance</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(allowances.specialAllowance)}</td></tr>
              <tr><td style="padding:8px 10px; color:#111827;">Conveyance</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(allowances.conveyanceAllowance)}</td></tr>
              <tr><td style="padding:8px 10px; color:#111827;">Medical</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(allowances.medicalAllowance)}</td></tr>
              ${renderListRows(otherAllowances)}
              ${salary?.overtimeAmount ? `<tr><td style="padding:8px 10px; color:#111827;">Overtime</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(salary.overtimeAmount)}</td></tr>` : ''}
              ${renderListRows(extraPayments)}
              <tr style="border-top:1px solid #e5e7eb; font-weight:700;"><td style="padding:10px; color:#0f172a;">Gross Salary</td><td style="padding:10px; text-align:right; color:#0f172a;">${formatCurrency(salary?.grossSalary)}</td></tr>
            </tbody>
          </table>
        </div>
        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:12px 14px; background:#f8fafc;">
          <h2 style="margin:0 0 10px; font-size:16px; color:#0f172a;">Deductions</h2>
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <tbody>
              <tr><td style="padding:8px 10px; color:#111827;">PF (Employee)</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(deductions.pfEmployeeContribution)}</td></tr>
              <tr><td style="padding:8px 10px; color:#111827;">PF (Employer)</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(deductions.pfEmployerContribution)}</td></tr>
              <tr><td style="padding:8px 10px; color:#111827;">ESI</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(deductions.esiContribution)}</td></tr>
              <tr><td style="padding:8px 10px; color:#111827;">Professional Tax</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(deductions.professionalTax)}</td></tr>
              <tr><td style="padding:8px 10px; color:#111827;">TDS</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(deductions.tdsAmount)}</td></tr>
              <tr><td style="padding:8px 10px; color:#111827;">Advance Recovery</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(deductions.advanceRecoveryPerMonth)}</td></tr>
              ${renderListRows(otherDeductions)}
              ${
                salary?.penaltiesAmount
                  ? `<tr><td style="padding:8px 10px; color:#111827;">Penalties</td><td style="padding:8px 10px; text-align:right; color:#111827;">${formatCurrency(
                      salary.penaltiesAmount,
                    )}</td></tr>`
                  : ''
              }
              <tr style="border-top:1px solid #e5e7eb; font-weight:700;"><td style="padding:10px; color:#0f172a;">Total Deductions</td><td style="padding:10px; text-align:right; color:#0f172a;">${formatCurrency(salary?.totalDeductions)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="margin-top:16px; padding:14px 16px; border-radius:12px; border:1px solid #e5e7eb; background:#ecfdf3; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <p style="margin:0; font-size:13px; color:#047857;">Net Payable</p>
          <p style="margin:4px 0 0; font-size:20px; font-weight:700; color:#065f46;">${formatCurrency(salary?.netPayable)}</p>
        </div>
        <div style="text-align:right; color:#4b5563; font-size:12px;">
          <p style="margin:0;">Status: ${salary?.paymentStatus || 'Pending'}</p>
          <p style="margin:4px 0 0;">Processed on: ${salary?.processedAt?.seconds ? new Date(salary.processedAt.seconds * 1000).toLocaleString('en-IN') : 'Draft'}</p>
          <p style="margin:6px 0 0; color:#9ca3af;">This is a system generated slip.</p>
        </div>
      </div>
    </section>
  `;
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

const SalarySlipPreview = ({ open, salary, staff, onClose, onDownloadPdf }) => {
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
              onClick={onDownloadPdf}
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

const StaffDashboard = () => {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [roleState, setRoleState] = useState({ loading: true, error: null });
  const [staffDoc, setStaffDoc] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [loginState, setLoginState] = useState({ email: '', password: '', error: null, loading: false });
  const [slipContext, setSlipContext] = useState({ open: false, salary: null });

  const handleDownloadSalarySlipPdf = useCallback(async () => {
    if (!slipContext.salary || !staffDoc) return;
    try {
      const label = monthLabel(slipContext.salary.month, slipContext.salary.year);
      const safeId = `${staffDoc.staffId || staffDoc.fullName || 'salary-slip'}`
        .replace(/[^a-z0-9-]/gi, '-')
        .toLowerCase();
      const contentHtml = buildSalarySlipContent(slipContext.salary, staffDoc, label);
      await renderPdfFromHtml({ contentHtml, filename: `salary-slip-${safeId}.pdf` });
    } catch (error) {
      console.error('Unable to download salary slip PDF', error);
    }
  }, [slipContext.salary, staffDoc]);

  useEffect(() => {
    const resolveRole = async (currentUser) => {
      const normalizeRole = (value) => (value || '').toString().toLowerCase().trim();
      const extractRole = (value) => {
        if (Array.isArray(value)) {
          const match = value.map(normalizeRole).find((entry) => entry === 'staff');
          return match || normalizeRole(value[0]);
        }
        return normalizeRole(value);
      };

      // 1) Doc ID == UID (primary path)
      const directDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (directDoc.exists()) {
        const role = extractRole(directDoc.data()?.role ?? directDoc.data()?.Role);
        if (role) return { role, docId: directDoc.id };
      }

      // 2) authUid field
      const authUidSnap = await getDocs(
        query(collection(db, 'users'), where('authUid', '==', currentUser.uid), limit(1)),
      );
      const authUidDoc = authUidSnap.docs[0];
      if (authUidDoc) {
        const role = extractRole(authUidDoc.data()?.role ?? authUidDoc.data()?.Role);
        if (role) return { role, docId: authUidDoc.id };
      }

      // 3) uid field (some projects store uid instead of authUid)
      const uidSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', currentUser.uid), limit(1)));
      const uidDoc = uidSnap.docs[0];
      if (uidDoc) {
        const role = extractRole(uidDoc.data()?.role ?? uidDoc.data()?.Role);
        if (role) return { role, docId: uidDoc.id };
      }

      // 4) Email-based fallback for misconfigured docs
      if (currentUser.email) {
        const emailSnap = await getDocs(
          query(collection(db, 'users'), where('email', '==', currentUser.email.toLowerCase()), limit(1)),
        );
        const emailDoc = emailSnap.docs[0];
        if (emailDoc) {
          const role = extractRole(emailDoc.data()?.role ?? emailDoc.data()?.Role);
          if (role) return { role, docId: emailDoc.id };
        }
      }

      // 5) As a last resort, infer staff role from staff profile when users doc is misconfigured.
      const staffSnap = await getDocs(
        query(collection(db, 'staff'), where('authUid', '==', currentUser.uid), limit(1)),
      );
      const staffDoc = staffSnap.docs[0];
      if (staffDoc) {
        const subRole = extractRole(staffDoc.data()?.subRole);
        const designation = extractRole(staffDoc.data()?.designationCategory);
        if (subRole === 'teacher' || designation === 'teaching' || designation === 'staff') {
          return { role: 'staff', docId: staffDoc.id };
        }
      }

      return { role: '', docId: null };
    };

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setRoleState({ loading: false, error: null });
        setAuthChecked(true);
        return;
      }

      setRoleState({ loading: true, error: null });

      try {
        const { role, docId } = await resolveRole(currentUser);

        if (role === 'staff') {
          setUser(currentUser);
          setRoleState({ loading: false, error: null, docId });
          setAuthChecked(true);
          return;
        }

        setUser(null);
        setRoleState({
          loading: false,
          error:
            'Role not assigned. Ensure the "users" document has role "staff" with either doc ID = UID or authUid/uid/email set.',
        });
        await signOut(auth);
        router.push('/unauthorized');
      } catch (error) {
        console.error('Unable to verify staff role', error);
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
        setStaffDoc({ id: docRef.id, ...docRef.data() });
      }
    };
    loadStaff();
  }, [user]);

  useEffect(() => {
    const loadAttendance = async () => {
      if (!staffDoc?.staffId) return;
      const attendanceQuery = query(
        collection(db, 'staffAttendance'),
        where('staffId', '==', staffDoc.staffId),
        orderBy('year', 'desc'),
        orderBy('month', 'desc'),
      );
      const snapshot = await getDocs(attendanceQuery);
      const rows = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setAttendance(rows);
    };
    loadAttendance();
  }, [staffDoc]);

  useEffect(() => {
    const loadSalaryHistory = async () => {
      if (!staffDoc?.staffId) return;
      const salaryQuery = query(
        collection(db, 'salaries'),
        where('staffId', '==', staffDoc.staffId),
        orderBy('year', 'desc'),
        orderBy('month', 'desc'),
      );
      const snapshot = await getDocs(salaryQuery);
      setSalaryHistory(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    };
    loadSalaryHistory();
  }, [staffDoc]);

  const attendanceSummary = useMemo(() => attendance[0] || null, [attendance]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await signInWithEmailAndPassword(auth, loginState.email, loginState.password);
    } catch (error) {
      console.error('Staff login failed', error);
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
          <title>Staff Portal</title>
        </Head>
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-cardinal/40 border-t-cardinal" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Head>
          <title>Staff Login · EL-NODE Pay</title>
        </Head>
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <Image src="/elnode.png" alt="EL-NODE" width={48} height={48} />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Staff Login</h1>
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
        <title>Staff Dashboard · EL-NODE Pay</title>
      </Head>
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Image src="/elnode.png" alt="EL-NODE Pay" width={48} height={48} />
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Staff Dashboard</h1>
              <p className="text-sm text-slate-600">View your profile, attendance, and salary slips.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-cardinal/10 px-3 py-1 text-xs font-semibold text-cardinal">
              Staff access
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
                <p className="font-semibold text-slate-900">{staffDoc?.fullName || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Staff ID</p>
                <p className="font-semibold text-slate-900">{staffDoc?.staffId || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Category</p>
                <p className="font-semibold text-slate-900">{staffDoc?.designationCategory || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Sub Role</p>
                <p className="font-semibold text-slate-900">{staffDoc?.subRole || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Employment</p>
                <p className="font-semibold text-slate-900">{staffDoc?.employmentType || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Date of Joining</p>
                <p className="font-semibold text-slate-900">
                  {staffDoc?.dateOfJoining?.toDate
                    ? staffDoc.dateOfJoining.toDate().toLocaleDateString('en-IN')
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
        staff={staffDoc}
        onDownloadPdf={handleDownloadSalarySlipPdf}
        onClose={() => setSlipContext({ open: false, salary: null })}
      />
    </div>
  );
};

export default StaffDashboard;
