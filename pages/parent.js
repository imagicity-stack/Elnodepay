import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const parseDateValue = (value) => {
  if (!value) return null;
  if (value?.toDate) {
    const date = value.toDate();
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const normaliseFeeStructure = (data = {}) => {
  const formattedFees = {};
  const rawFees = data?.fees || {};
  Object.keys(rawFees).forEach((className) => {
    const entry = rawFees[className] || {};
    formattedFees[className] = {
      monthly: Number(entry.monthly || 0),
      quarterly: Number(entry.quarterly || 0),
      halfYearly: Number(entry.halfYearly || 0),
    };
  });
  return {
    session: data?.session || '',
    fees: formattedFees,
  };
};

const PayNowModal = ({
  open,
  student,
  selections,
  advanceOptions = [],
  selectedAdvanceId,
  advanceEnabled,
  onAdvanceSelect,
  onAdvanceToggle,
  onToggle,
  onClose,
  onConfirm,
  processing,
  total,
}) => {
  if (!open || !student) return null;

  const advanceUnavailable = advanceOptions.every((plan) => plan.disabled);
  const availableAdvanceOptions = advanceOptions.filter((plan) => !plan.disabled);
  const selectedAdvancePlan = advanceOptions.find((plan) => plan.id === selectedAdvanceId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Pay fees</h3>
            <p className="text-sm text-slate-500">Select the fee components you wish to pay right now for {student.name}.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
          >
            Close
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 text-sm text-slate-700">
          <div className="space-y-4">
            {selections.map((item, index) => (
              <label
                key={`${item.label}-${index}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => onToggle(index)}
                    className="h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal"
                  />
                  <div>
                    <p className="font-medium text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">₹{Number(item.amount || 0).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-900">₹{Number(item.amount || 0).toLocaleString('en-IN')}</span>
              </label>
            ))}
          </div>
          {advanceOptions.length > 0 && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-900">
                <input
                  type="checkbox"
                  checked={advanceEnabled}
                  onChange={(event) => onAdvanceToggle(event.target.checked)}
                  disabled={advanceUnavailable}
                  className="h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal disabled:opacity-50"
                />
                Pay advance
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Reserve upcoming fee cycles for {student.name} in one go.
              </p>
              {advanceUnavailable && advanceOptions[0]?.helperText && (
                <p className="mt-3 text-xs font-medium text-emerald-600">
                  {advanceOptions[0].helperText}
                </p>
              )}
              {advanceEnabled && availableAdvanceOptions.length > 0 && (
                <div className="mt-4 space-y-2">
                  <label className="text-xs font-semibold text-slate-500" htmlFor="advance-term">
                    Select payment term
                  </label>
                  <div className="relative">
                    <select
                      id="advance-term"
                      value={selectedAdvanceId || ''}
                      onChange={(event) => onAdvanceSelect(event.target.value)}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    >
                      {availableAdvanceOptions.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.dropdownLabel || plan.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                      ▾
                    </span>
                  </div>
                  {selectedAdvancePlan && (
                    <p className="text-xs text-slate-500">
                      Paying ₹{Number(selectedAdvancePlan.amount || 0).toLocaleString('en-IN')} to cover
                      {' '}
                      {selectedAdvancePlan.months} month{selectedAdvancePlan.months > 1 ? 's' : ''} ({selectedAdvancePlan.cycle}).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="mt-6 rounded-2xl border border-cardinal bg-cardinal/5 px-4 py-3 text-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total payable</span>
              <span className="text-lg font-semibold text-cardinal">₹{total.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={processing || total <= 0}
            className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {processing ? 'Processing…' : `Pay ₹${total.toLocaleString('en-IN')}`}
          </button>
        </div>
      </div>
    </div>
  );
};

const NotificationCard = ({ notification, onMarkRead }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
        <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
        <p className="mt-2 text-xs text-slate-400">
          {notification.created_at?.toDate
            ? notification.created_at.toDate().toLocaleString()
            : notification.created_at || ''}
        </p>
      </div>
      {!notification.read && (
        <button
          type="button"
          onClick={() => onMarkRead(notification.id)}
          className="rounded-lg border border-cardinal px-3 py-1 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
        >
          Mark as read
        </button>
      )}
    </div>
  </div>
);

const ParentDashboard = () => {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [storeCharges, setStoreCharges] = useState([]);
  const [feeRequests, setFeeRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState({ currentTerm: '', defaultDueDate: '' });
  const [feeStructure, setFeeStructure] = useState({ session: '', fees: {} });
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [historyFilters, setHistoryFilters] = useState({ child: 'All', month: 'All', year: 'All' });
  const [supportForm, setSupportForm] = useState({ subject: '', message: '' });
  const [profileForm, setProfileForm] = useState({ name: '', contactNumber: '' });
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [paymentContext, setPaymentContext] = useState({
    open: false,
    student: null,
    selections: [],
    advanceOptions: [],
    selectedAdvanceId: null,
    advanceEnabled: false,
  });
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
    } finally {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('elnode-remember-me');
        window.sessionStorage.removeItem('elnode-remember-me');
      }
      router.replace('/');
    }
  }, [router]); // fix: define before effects to avoid init issues

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setAuthChecked(true);
        router.replace('/');
        return;
      }

      const profileRef = doc(db, 'users', currentUser.uid);
      const profileSnap = await getDoc(profileRef);
      if (!profileSnap.exists() || profileSnap.data().role !== 'parent') {
        setAuthChecked(true);
        router.replace(profileSnap.data()?.role === 'accountant' ? '/accountant' : '/');
        return;
      }

      const profileData = profileSnap.data();
      setProfile(profileData);
      setProfileForm({
        name: profileData.name || currentUser.displayName || '',
        contactNumber: profileData.contactNumber || '',
      });
      setUser(currentUser);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!authChecked || !user) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('elnode-remember-me') === 'true') {
      return;
    }

    const INACTIVITY_LIMIT = 4 * 60 * 1000;
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    let timerId;

    const resetTimer = () => {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(() => {
        handleSignOut();
      }, INACTIVITY_LIMIT);
    };

    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [authChecked, user, handleSignOut]);

  useEffect(() => {
    if (!user) return;

    const studentsQuery = query(collection(db, 'students'), where('parent_email', '==', user.email));
    const unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setStudents(data);
      if (!selectedChildId && data.length > 0) {
        setSelectedChildId(data[0].id);
      }
    });

    const paymentsQuery = query(
      collection(db, 'payments'),
      where('parent_email', '==', user.email),
      orderBy('date', 'desc'),
    );
    const unsubscribePayments = onSnapshot(paymentsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setPayments(data);
    });

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('user_uid', '==', user.uid),
      orderBy('created_at', 'desc'),
    );
    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setNotifications(data);
    });

    const chargesQuery = query(
      collection(db, 'store_charges'),
      where('parent_email', '==', user.email),
      orderBy('created_at', 'desc'),
    );
    const unsubscribeCharges = onSnapshot(chargesQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setStoreCharges(data);
    });

    const feeRequestsQuery = query(
      collection(db, 'fee_requests'),
      where('parent_email', '==', user.email),
      orderBy('created_at', 'desc'),
    );
    const unsubscribeFeeRequests = onSnapshot(feeRequestsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setFeeRequests(data);
    });

    const settingsRef = doc(db, 'settings', 'general');
    const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          currentTerm: data.currentTerm || '',
          defaultDueDate: data.defaultDueDate || '',
          reminderTemplate: data.reminderTemplate,
        });
      }
    });

    const feeStructureRef = doc(db, 'settings', 'feestructure');
    const unsubscribeFeeStructure = onSnapshot(feeStructureRef, (snapshot) => {
      if (snapshot.exists()) {
        setFeeStructure(normaliseFeeStructure(snapshot.data()));
      } else {
        setFeeStructure(normaliseFeeStructure({}));
      }
    });

    if (typeof window !== 'undefined' && !document.getElementById('razorpay-script')) {
      const script = document.createElement('script');
      script.id = 'razorpay-script';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      unsubscribeStudents();
      unsubscribePayments();
      unsubscribeNotifications();
      unsubscribeSettings();
      unsubscribeFeeStructure();
      unsubscribeCharges();
      unsubscribeFeeRequests();
    };
  }, [user]);

  const metrics = useMemo(() => {
    const chargeMap = new Map();
    storeCharges.forEach((charge) => {
      if (charge.paid) return;
      const key = charge.student_doc_id || charge.studentId;
      if (!key) return;
      const amount = Number(charge.amount || 0);
      chargeMap.set(key, (chargeMap.get(key) || 0) + amount);
    });
    const totalDue = students.reduce((sum, student) => {
      const tuitionDue = Number(student.balance ?? student.fee_amount ?? 0);
      const storeDue = chargeMap.get(student.id) || 0;
      return sum + tuitionDue + storeDue;
    }, 0);
    const nextDueDate = students
      .map((student) => student.due_date)
      .filter(Boolean)
      .map((date) => new Date(date))
      .filter((date) => Number.isFinite(date.getTime()))
      .sort((a, b) => a - b)[0];
    const lastPayment = payments[0] || null;
    return {
      totalDue,
      nextDueDate: nextDueDate ? nextDueDate.toLocaleDateString() : '—',
      lastPayment,
    };
  }, [students, payments, storeCharges]);

  const chargesByStudent = useMemo(() => {
    const map = new Map();
    storeCharges.forEach((charge) => {
      if (charge.paid) return;
      const key = charge.student_doc_id || charge.studentId;
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(charge);
    });
    return map;
  }, [storeCharges]);

  const getAdvancePlanOptions = useCallback(
    (student) => {
      if (!student) return [];
      const entry = feeStructure.fees?.[student.class] || {};
      const monthly = Number(entry.monthly || 0);
      const quarterlyRaw = Number(entry.quarterly || 0);
      const halfYearlyRaw = Number(entry.halfYearly || 0);
      const quarterly = quarterlyRaw > 0 ? quarterlyRaw : monthly * 3;
      const halfYearly = halfYearlyRaw > 0 ? halfYearlyRaw : quarterly * 2 || monthly * 6;
      const plans = [
        { id: 'advance-monthly', label: 'Pay 1 month in advance', months: 1, cycle: 'Monthly', amount: monthly },
        { id: 'advance-quarterly', label: 'Pay 3 months in advance', months: 3, cycle: 'Quarterly', amount: quarterly },
        { id: 'advance-halfyearly', label: 'Pay 6 months in advance', months: 6, cycle: 'Half-Yearly', amount: halfYearly },
      ].filter((plan) => plan.amount > 0);
      if (!plans.length) return [];
      const coverageEnd = parseDateValue(student.advance_plan_end);
      const hasActiveCoverage = coverageEnd && coverageEnd.getTime() > Date.now();
      return plans.map((plan) => {
        const amountLabel = `₹${Number(plan.amount || 0).toLocaleString('en-IN')}`;
        const monthsLabel = `${plan.months} month${plan.months > 1 ? 's' : ''}`;
        return {
          ...plan,
          helperText: hasActiveCoverage
            ? `Advance active until ${coverageEnd.toLocaleDateString('en-IN')}`
            : amountLabel,
          dropdownLabel: `${monthsLabel} (${plan.cycle}) · ${amountLabel}`,
          disabled: hasActiveCoverage,
        };
      });
    },
    [feeStructure],
  );

  const getAdvanceStatus = useCallback((student) => {
    if (!student) return null;
    const endDate = parseDateValue(student.advance_plan_end);
    if (!endDate || endDate.getTime() <= Date.now()) {
      return null;
    }
    const label = student.advance_plan_cycle ||
      (student.advance_plan_months ? `${student.advance_plan_months} months` : 'Advance plan');
    return {
      label,
      endDate,
      message: `${label ? `${label} · ` : ''}Paid till ${endDate.toLocaleDateString('en-IN')}`,
    };
  }, []);

  const activeFeeRequests = useMemo(() => {
    const safeFeeRequests = Array.isArray(feeRequests) ? feeRequests : [];
    const activeRequests = safeFeeRequests.filter(
      (r) => r && r.status !== 'Paid' && Number(r.balance ?? r.amount_total ?? 0) > 0,
    );
    return activeRequests;
  }, [feeRequests]);

  const requestExtrasByStudent = useMemo(() => {
    const map = new Map();
    const formatDateLabel = (raw) => {
      const parsed = parseDateValue(raw);
      return parsed ? parsed.toLocaleDateString('en-IN') : '';
    };
    activeFeeRequests.forEach((request) => {
      const key = request.studentId || request.student_doc_id || request.studentDocId;
      if (!key) return;
      const outstanding = Number(request.balance ?? request.amount_total ?? 0);
      if (!map.has(key)) {
        map.set(key, { store: [], others: [], requests: [] });
      }
      const groups = map.get(key);
      const storeBreakdown = request.breakdown?.store;
      const othersBreakdown = request.breakdown?.others;
      if (storeBreakdown && Number(storeBreakdown.amount || 0) > 0) {
        groups.store.push({
          id: `${request.id}-store`,
          label: storeBreakdown.label || 'Store Item',
          amount: Number(storeBreakdown.amount || 0),
          created_at: request.created_at,
          due_date: request.due_date,
        });
      }
      if (othersBreakdown && Number(othersBreakdown.amount || 0) > 0) {
        groups.others.push({
          id: `${request.id}-others`,
          label: othersBreakdown.label || 'Others',
          amount: Number(othersBreakdown.amount || 0),
          created_at: request.created_at,
          due_date: request.due_date,
        });
      }
      const breakdown =
        request.breakdown && typeof request.breakdown === 'object' ? request.breakdown : {};
      const labelParts = [];
      const pushLabel = (item, fallback) => {
        if (!item) return;
        const amount = Number(item.amount || 0);
        if (!(amount > 0)) return;
        labelParts.push(item.label || fallback);
      };
      pushLabel(
        breakdown.tuition,
        request.fee_cycle ? `${request.fee_cycle} Fee` : 'Tuition Fee',
      );
      pushLabel(breakdown.custom, 'Custom Fee');
      pushLabel(breakdown.store, 'Store Charge');
      pushLabel(breakdown.others, 'Other Charge');
      const fallbackLabel =
        request.title ||
        request.reason ||
        request.note ||
        request.fee_cycle ||
        request.cycle ||
        'Fee request';
      const baseLabel = labelParts.length ? labelParts.join(' + ') : fallbackLabel;
      const dueDateLabel = formatDateLabel(request.due_date);
      const requestLabel = dueDateLabel ? `${baseLabel} · Due ${dueDateLabel}` : baseLabel;
      groups.requests.push({
        id: request.id,
        label: requestLabel,
        amount: outstanding,
        created_at: request.created_at,
        due_date: request.due_date,
      });
    });
    return map;
  }, [activeFeeRequests]);

  const paymentHistory = useMemo(() => {
    return payments.filter((payment) => {
      const matchesChild =
        historyFilters.child === 'All' || payment.studentId === historyFilters.child;
      const date = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
      if (!Number.isFinite(date.getTime())) return matchesChild && historyFilters.month === 'All' && historyFilters.year === 'All';
      const matchesMonth =
        historyFilters.month === 'All' ||
        date.getMonth() + 1 === Number(historyFilters.month);
      const matchesYear =
        historyFilters.year === 'All' ||
        date.getFullYear() === Number(historyFilters.year);
      return matchesChild && matchesMonth && matchesYear;
    });
  }, [payments, historyFilters]);

  const yearsAvailable = useMemo(() => {
    const yearSet = new Set();
    payments.forEach((payment) => {
      const date = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
      if (Number.isFinite(date.getTime())) {
        yearSet.add(date.getFullYear());
      }
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [payments]);

  const selectedStudent = students.find((student) => student.id === selectedChildId) || null;
  const selectedStudentCharges = selectedStudent
    ? chargesByStudent.get(selectedStudent.id) || []
    : [];
  const selectedStudentAdvanceStatus = getAdvanceStatus(selectedStudent);
  const selectedStudentRequestExtras = (() => {
    if (!selectedStudent) return { store: [], others: [], requests: [] };
    const key = selectedStudent.studentId || selectedStudent.id;
    return requestExtrasByStudent.get(key) || { store: [], others: [], requests: [] };
  })();
  const legacyStoreTotal = selectedStudentCharges.reduce(
    (sum, charge) => sum + Number(charge.amount || 0),
    0,
  );
  const requestStoreTotal = selectedStudentRequestExtras.store.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  const selectedStudentStoreTotal = legacyStoreTotal + requestStoreTotal;
  const selectedStudentOthersTotal = selectedStudentRequestExtras.others.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  const selectedStudentTotalDue = selectedStudent
    ? Number(selectedStudent.balance ?? selectedStudent.fee_amount ?? 0) + legacyStoreTotal
    : 0;

  const selectedStudentExtraGroups = useMemo(() => {
    if (!selectedStudent) return { store: [], others: [] };
    const groups = { store: [], others: [] };
    const formatDate = (raw) => {
      if (!raw) return '—';
      if (raw.toDate) {
        const date = raw.toDate();
        if (Number.isFinite(date.getTime())) return date.toLocaleDateString();
      }
      const parsed = new Date(raw);
      if (Number.isFinite(parsed.getTime())) return parsed.toLocaleDateString();
      return '—';
    };

    selectedStudentCharges.forEach((charge) => {
      const dateLabel = (() => {
        if (charge.charge_date) {
          const parsed = new Date(charge.charge_date);
          if (Number.isFinite(parsed.getTime())) {
            return parsed.toLocaleDateString();
          }
        }
        if (charge.created_at?.toDate) {
          return charge.created_at.toDate().toLocaleDateString();
        }
        if (charge.created_at) {
          const created = new Date(charge.created_at);
          if (Number.isFinite(created.getTime())) {
            return created.toLocaleDateString();
          }
        }
        return '—';
      })();
      groups.store.push({
        id: `legacy-${charge.id}`,
        label: charge.item_name || 'Store charge',
        amount: Number(charge.amount || 0),
        date: dateLabel,
      });
    });

    selectedStudentRequestExtras.store.forEach((item) => {
      groups.store.push({
        id: item.id,
        label: item.label,
        amount: Number(item.amount || 0),
        date: formatDate(item.due_date || item.created_at),
      });
    });

    selectedStudentRequestExtras.others.forEach((item) => {
      groups.others.push({
        id: item.id,
        label: item.label,
        amount: Number(item.amount || 0),
        date: formatDate(item.due_date || item.created_at),
      });
    });

    return groups;
  }, [selectedStudent, selectedStudentCharges, selectedStudentRequestExtras]);

  const outstandingSelectedAmount = useMemo(() => {
    if (!paymentContext.open) return 0;
    return paymentContext.selections
      .filter((item) => item.selected)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [paymentContext]);

  const advanceSelectionAmount = useMemo(() => {
    if (!paymentContext.open || !paymentContext.advanceEnabled) return 0;
    const plan = (paymentContext.advanceOptions || []).find(
      (option) => option.id === paymentContext.selectedAdvanceId,
    );
    return Number(plan?.amount || 0);
  }, [paymentContext]);

  const totalSelectedAmount = outstandingSelectedAmount + advanceSelectionAmount;

  const handleOpenPayment = (student) => {
    if (!student) return;

    const baseBreakdown = Array.isArray(student.fee_breakdown) && student.fee_breakdown.length > 0
      ? student.fee_breakdown
      : [
          {
            label: 'Outstanding balance',
            amount: Number(student.balance ?? student.fee_amount ?? 0),
            selected: true,
          },
        ];

    const normalizeItems = (items = [], type = 'tuition') =>
      items
        .filter((item) => Number(item.amount || 0) > 0)
        .map((item) => ({
          label: item.label,
          amount: Number(item.amount || 0),
          selected: item.selected ?? true,
          type,
        }));

    const chargeKeys = [student.id, student.studentId].filter(Boolean);
    const seenChargeIds = new Set();
    const storeChargeItems = [];
    chargeKeys.forEach((key) => {
      const list = chargesByStudent.get(key) || [];
      list.forEach((charge) => {
        if (seenChargeIds.has(charge.id)) return;
        seenChargeIds.add(charge.id);
        const amount = Number(charge.amount || 0);
        if (amount <= 0) return;
        storeChargeItems.push({
          label: charge.item_name || charge.label || 'Store charge',
          amount,
          selected: true,
          type: 'store',
        });
      });
    });

    const extraKeys = [student.studentId, student.id].filter(Boolean);
    const seenExtraIds = new Set();
    const requestExtraItems = [];
    const requestSelectionItems = [];
    const seenRequestIds = new Set();
    extraKeys.forEach((key) => {
      const extras = requestExtrasByStudent.get(key);
      if (!extras) return;
      extras.store.forEach((item) => {
        if (seenExtraIds.has(item.id)) return;
        seenExtraIds.add(item.id);
        const amount = Number(item.amount || 0);
        if (amount <= 0) return;
        requestExtraItems.push({
          label: item.label || 'Store charge',
          amount,
          selected: true,
          type: 'store',
        });
      });
      extras.others.forEach((item) => {
        if (seenExtraIds.has(item.id)) return;
        seenExtraIds.add(item.id);
        const amount = Number(item.amount || 0);
        if (amount <= 0) return;
        requestExtraItems.push({
          label: item.label || 'Additional charge',
          amount,
          selected: true,
          type: 'others',
        });
      });
      (extras.requests || []).forEach((requestItem) => {
        if (seenRequestIds.has(requestItem.id)) return;
        seenRequestIds.add(requestItem.id);
        const amount = Number(requestItem.amount || 0);
        if (amount <= 0) return;
        requestSelectionItems.push({
          label: requestItem.label || 'Fee request',
          amount,
          selected: true,
          type: 'request',
          requestId: requestItem.id,
          dueDate: requestItem.due_date || requestItem.created_at,
        });
      });
    });

    requestSelectionItems.sort((a, b) => {
      const dateA = parseDateValue(a.dueDate)?.getTime() || 0;
      const dateB = parseDateValue(b.dueDate)?.getTime() || 0;
      return dateA - dateB;
    });

    const baseItems = normalizeItems(baseBreakdown, 'tuition');
    const useRequestSelections = requestSelectionItems.length > 0;
    const selections = [
      ...(useRequestSelections ? requestSelectionItems : baseItems),
      ...storeChargeItems,
      ...(useRequestSelections ? [] : requestExtraItems),
    ];

    const advanceOptions = getAdvancePlanOptions(student);

    setPaymentContext({
      open: true,
      student,
      selections,
      advanceOptions,
      selectedAdvanceId: null,
      advanceEnabled: false,
    });
  };

  const handleToggleSelection = (index) => {
    setPaymentContext((prev) => ({
      ...prev,
      selections: prev.selections.map((item, idx) =>
        idx === index ? { ...item, selected: !item.selected } : item,
      ),
    }));
  };

  const handleAdvanceSelection = (planId) => {
    setPaymentContext((prev) => {
      const isValid = (prev.advanceOptions || []).some(
        (option) => option.id === planId && !option.disabled,
      );
      if (!isValid) {
        return prev;
      }
      return {
        ...prev,
        selectedAdvanceId: planId,
      };
    });
  };

  const handleToggleAdvance = (enabled) => {
    setPaymentContext((prev) => {
      if (!enabled) {
        return { ...prev, advanceEnabled: false, selectedAdvanceId: null };
      }
      const validOptions = (prev.advanceOptions || []).filter((option) => !option.disabled);
      if (!validOptions.length) {
        return { ...prev, advanceEnabled: false, selectedAdvanceId: null };
      }
      const fallbackPlan = validOptions.find((option) => option.id === prev.selectedAdvanceId);
      return {
        ...prev,
        advanceEnabled: true,
        selectedAdvanceId: (fallbackPlan || validOptions[0]).id,
      };
    });
  };

  const handleClosePayment = () => {
    setPaymentContext({
      open: false,
      student: null,
      selections: [],
      advanceOptions: [],
      selectedAdvanceId: null,
      advanceEnabled: false,
    });
    setPaymentProcessing(false);
  };

  const handleProcessPayment = async () => {
    if (!paymentContext.student || totalSelectedAmount <= 0) return;
    const advancePlan = paymentContext.advanceEnabled
      ? (paymentContext.advanceOptions || []).find(
          (plan) => plan.id === paymentContext.selectedAdvanceId,
        )
      : null;
    if (typeof window === 'undefined' || !window.Razorpay) {
      alert('Payment gateway is still loading. Please try again in a moment.');
      return;
    }
    setPaymentProcessing(true);
    const selectedItems = paymentContext.selections.filter((item) => item.selected);
    if (advancePlan) {
      selectedItems.push({
        label: advancePlan.label,
        amount: Number(advancePlan.amount || 0),
        selected: true,
        type: 'advance',
        months: advancePlan.months,
        cycle: advancePlan.cycle,
      });
    }
    try {
      const orderResponse = await fetch('/api/createOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalSelectedAmount,
          userId: user.uid,
          studentId: paymentContext.student.studentId || paymentContext.student.id,
          studentDocId: paymentContext.student.id,
          studentName: paymentContext.student.name,
          parentEmail: user.email,
          breakdown: selectedItems,
          term: settings.currentTerm || '',
          advancePayment: advancePlan
            ? {
                months: advancePlan.months,
                cycle: advancePlan.cycle,
                amount: Number(advancePlan.amount || 0),
                label: advancePlan.label,
              }
            : null,
        }),
      });
      const orderData = await orderResponse.json();
      if (!orderData.success) {
        throw new Error(orderData.message || 'Unable to initiate payment');
      }

      const derivePaymentTitle = () => {
        const categoryLabels = {
          tuition: 'Tuition',
          store: 'Store',
          others: 'Others',
          advance: 'Advance',
          request: 'Request',
        };
        const categories = Array.from(
          new Set(
            selectedItems.map((item) => categoryLabels[item.type] || 'Tuition'),
          ),
        );
        if (categories.length === 0) {
          return 'EHS Fees';
        }
        if (categories.length === 1) {
          return `EHS ${categories[0]} Fees`;
        }
        return `EHS Fees (${categories.join(' + ')})`;
      };

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.order.amount,
        currency: 'INR',
        name: derivePaymentTitle(),
        description: `Fee payment for ${paymentContext.student.name}`,
        order_id: orderData.order.id,
        handler: async (response) => {
          try {
            const verifyResponse = await fetch('/api/verifyPayment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...response,
                userId: user.uid,
                amount: totalSelectedAmount,
                studentDocId: paymentContext.student.id,
                studentId: paymentContext.student.studentId || paymentContext.student.id,
                studentName: paymentContext.student.name,
                parentEmail: user.email,
                parentUid: user.uid,
                className: paymentContext.student.class,
                term: settings.currentTerm || '',
                feeType:
                  selectedItems.length > 1
                    ? 'Multiple'
                    : selectedItems[0]?.label || 'Tuition',
                breakdown: selectedItems,
                paymentMode: 'Online',
                advancePayment: advancePlan
                  ? {
                      months: advancePlan.months,
                      cycle: advancePlan.cycle,
                      amount: Number(advancePlan.amount || 0),
                      label: advancePlan.label,
                    }
                  : null,
              }),
            });
            const verifyData = await verifyResponse.json();
            if (!verifyData.success) {
              throw new Error(verifyData.message || 'Payment verification failed');
            }
            alert('Payment successful!');
            handleClosePayment();
          } catch (error) {
            console.error(error);
            alert(error.message || 'Unable to verify payment. Please contact support.');
          } finally {
            setPaymentProcessing(false);
          }
        },
        prefill: {
          name: profileForm.name || profile?.name || '',
          email: user.email,
          contact: profileForm.contactNumber || '',
        },
        notes: {
          parent_uid: user.uid,
          student_id: paymentContext.student.studentId || paymentContext.student.id,
        },
        theme: {
          color: '#A31F36',
        },
        modal: {
          ondismiss: () => {
            setPaymentProcessing(false);
          },
        },
      };
      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Unable to start payment. Please try again.');
      setPaymentProcessing(false);
    }
  };

  const handleSupportSubmit = async (event) => {
    event.preventDefault();
    if (!supportForm.subject || !supportForm.message) return;
    setSupportSubmitting(true);
    try {
      await addDoc(collection(db, 'support_tickets'), {
        parent_uid: user.uid,
        parent_email: user.email,
        subject: supportForm.subject,
        message: supportForm.message,
        status: 'Open',
        created_at: serverTimestamp(),
      });
      setSupportForm({ subject: '', message: '' });
      alert('Support request submitted. Our team will reach out soon.');
    } catch (error) {
      console.error(error);
      alert('Unable to submit request. Please try again.');
    } finally {
      setSupportSubmitting(false);
    }
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setProfileSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: profileForm.name,
        contactNumber: profileForm.contactNumber,
        updated_at: serverTimestamp(),
      });
      alert('Profile updated successfully.');
    } catch (error) {
      console.error(error);
      alert('Unable to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleNotificationRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (error) {
      console.error('Unable to mark notification as read', error);
    }
  };

  const handleDownloadReceipt = (payment) => {
    if (typeof window === 'undefined') return;
    const win = window.open('', '_blank', 'width=600,height=800');
    if (!win) return;
    const date = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
    win.document.write(`
      <html>
        <head>
          <title>Payment Receipt</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
            h1 { color: #A31F36; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
            .total { font-weight: bold; font-size: 18px; }
          </style>
        </head>
        <body>
          <h1>Payment Receipt</h1>
          <p>Thank you for your payment. Below are the details.</p>
          <table>
            <tr><td>Student</td><td>${payment.student_name}</td></tr>
            <tr><td>Class</td><td>${payment.class || '-'}</td></tr>
            <tr><td>Amount</td><td>₹${Number(payment.amount || 0).toLocaleString('en-IN')}</td></tr>
            <tr><td>Date</td><td>${date.toLocaleString()}</td></tr>
            <tr><td>Mode</td><td>${payment.mode || 'Online'}</td></tr>
            <tr><td>Status</td><td>${payment.status}</td></tr>
            <tr><td>Transaction ID</td><td>${
              payment.razorpay_payment_id || payment.transaction_id || 'N/A'
            }</td></tr>
          </table>
          <p class="total">Total Paid: ₹${Number(payment.amount || 0).toLocaleString('en-IN')}</p>
          <p>— EL-NODE Pay</p>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  const handleResetPassword = async () => {
    try {
      await sendPasswordResetEmail(auth, user.email);
      alert('Password reset email sent.');
    } catch (error) {
      console.error(error);
      alert('Unable to send reset email.');
    }
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-cardinal">
        <Head>
          <title>Parent Dashboard</title>
        </Head>
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-cardinal/40 border-t-cardinal" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Head>
        <title>Parent Dashboard · EL-NODE Pay</title>
      </Head>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Image src="/elnode.png" alt="EL-NODE Pay logo" width={48} height={48} priority />
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Parent Dashboard</h1>
              <p className="text-sm text-slate-600">
                Manage your children’s fee payments, track history, and stay on top of reminders.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => students.length > 0 && handleOpenPayment(students[0])}
              disabled={metrics.totalDue <= 0}
              className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {metrics.totalDue > 0 ? 'Pay Outstanding Balance' : 'All Clear'}
            </button>
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

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500">Total Fees Due</h3>
            <p className="mt-3 text-2xl font-semibold text-cardinal">
              ₹{metrics.totalDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {metrics.totalDue > 0 ? 'Pay soon to avoid penalties.' : 'No outstanding dues!'}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500">Next Due Date</h3>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{metrics.nextDueDate}</p>
            <p className="mt-2 text-xs text-slate-500">Based on scheduled invoices.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500">Last Payment</h3>
            <p className="mt-3 text-2xl font-semibold text-slate-900">
              {metrics.lastPayment
                ? `₹${Number(metrics.lastPayment.amount || 0).toLocaleString('en-IN')}`
                : '—'}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {metrics.lastPayment
                ? metrics.lastPayment.date?.toDate
                  ? metrics.lastPayment.date.toDate().toLocaleString()
                  : new Date(metrics.lastPayment.date).toLocaleString()
                : 'No payments yet.'}
            </p>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Your Children</h2>
              <p className="text-sm text-slate-500">Select a profile to review due amounts and pay instantly.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {students.map((student) => {
              const chargeList = chargesByStudent.get(student.id) || [];
              const storeChargeTotal = chargeList.reduce(
                (sum, charge) => sum + Number(charge.amount || 0),
                0,
              );
              const tuitionDue = Number(student.balance ?? student.fee_amount ?? 0);
              const totalDue = tuitionDue + storeChargeTotal;
              const advanceStatus = getAdvanceStatus(student);
              return (
                <div
                  key={student.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedChildId(student.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedChildId(student.id);
                    }
                  }}
                  className={`rounded-3xl border ${
                    selectedChildId === student.id ? 'border-cardinal bg-cardinal/5' : 'border-slate-200 bg-white'
                  } p-6 shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cardinal/30 cursor-pointer`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{student.name}</h3>
                      <p className="text-sm text-slate-500">Class {student.class}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        student.status === 'Paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : student.status === 'Overdue'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {student.status}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-600">
                    <p>Total due: ₹{totalDue.toLocaleString('en-IN')}</p>
                    <p>Tuition balance: ₹{tuitionDue.toLocaleString('en-IN')}</p>
                    <p>Store charges: ₹{storeChargeTotal.toLocaleString('en-IN')}</p>
                    <p>Fee cycle: {student.fee_cycle || 'Monthly'}</p>
                    <p>Due date: {student.due_date || 'Not scheduled'}</p>
                    {advanceStatus && (
                      <p className="text-xs font-semibold text-emerald-600">{advanceStatus.message}</p>
                    )}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedChildId(student.id);
                        handleOpenPayment(student);
                      }}
                      className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90"
                    >
                      Pay Now
                    </button>
                  </div>
                </div>
              );
            })}
            {students.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                No student profiles are linked to this account yet.
              </div>
            )}
          </div>

          {selectedStudent && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{selectedStudent.name} · Details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Fee Overview</p>
                  <p className="mt-2">
                    Total fee: ₹{Number(selectedStudent.fee_amount || 0).toLocaleString('en-IN')}
                  </p>
                  <p className="mt-1">
                    Tuition balance: ₹{Number(selectedStudent.balance ?? 0).toLocaleString('en-IN')}
                  </p>
                  <p className="mt-1">
                    Store charges due: ₹{selectedStudentStoreTotal.toLocaleString('en-IN')}
                  </p>
                  <p className="mt-1">
                    Other charges due: ₹{selectedStudentOthersTotal.toLocaleString('en-IN')}
                  </p>
                  <p className="mt-1 font-semibold text-slate-900">
                    Overall due: ₹{selectedStudentTotalDue.toLocaleString('en-IN')}
                  </p>
                  <p className="mt-1">Fee cycle: {selectedStudent.fee_cycle || 'Monthly'}</p>
                  <p className="mt-1">Due date: {selectedStudent.due_date || '—'}</p>
                  {selectedStudentAdvanceStatus && (
                    <p className="mt-1 text-xs font-semibold text-emerald-600">
                      {selectedStudentAdvanceStatus.message}
                    </p>
                  )}
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Fee Breakdown</p>
                  <ul className="mt-2 space-y-2">
                    {(Array.isArray(selectedStudent.fee_breakdown) && selectedStudent.fee_breakdown.length > 0
                      ? selectedStudent.fee_breakdown
                      : [
                          {
                            label: 'Term Fee',
                            amount: Number(selectedStudent.balance ?? selectedStudent.fee_amount ?? 0),
                          },
                        ]
                    ).map((item, index) => (
                      <li key={`${selectedStudent.id}-fee-${index}`} className="flex justify-between text-sm">
                        <span>{item.label}</span>
                        <span>₹{Number(item.amount || 0).toLocaleString('en-IN')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Extra Charges</p>
                  {selectedStudentExtraGroups.store.length > 0 || selectedStudentExtraGroups.others.length > 0 ? (
                    <div className="mt-2 space-y-3">
                      {selectedStudentExtraGroups.others.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other Charges</p>
                          <ul className="mt-2 space-y-2">
                            {selectedStudentExtraGroups.others.map((item) => (
                              <li key={item.id} className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-slate-900">{item.label}</p>
                                  <p className="text-xs text-slate-500">{item.date}</p>
                                </div>
                                <span className="text-sm font-semibold text-slate-900">
                                  ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedStudentExtraGroups.store.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Store Charges</p>
                          <ul className="mt-2 space-y-2">
                            {selectedStudentExtraGroups.store.map((item) => (
                              <li key={item.id} className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-slate-900">{item.label}</p>
                                  <p className="text-xs text-slate-500">{item.date}</p>
                                </div>
                                <span className="text-sm font-semibold text-slate-900">
                                  ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">No pending extra charges.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Payment History</h2>
              <p className="text-sm text-slate-500">Download receipts and filter by student or timeframe.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={historyFilters.child}
                onChange={(event) =>
                  setHistoryFilters((prev) => ({ ...prev, child: event.target.value }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              >
                <option value="All">All Children</option>
                {students.map((student) => (
                  <option key={student.id} value={student.studentId || student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
              <select
                value={historyFilters.month}
                onChange={(event) =>
                  setHistoryFilters((prev) => ({ ...prev, month: event.target.value }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              >
                <option value="All">All Months</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => (
                  <option key={month} value={month}>
                    {new Date(0, month - 1).toLocaleString('en-IN', { month: 'short' })}
                  </option>
                ))}
              </select>
              <select
                value={historyFilters.year}
                onChange={(event) =>
                  setHistoryFilters((prev) => ({ ...prev, year: event.target.value }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              >
                <option value="All">All Years</option>
                {yearsAvailable.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Child</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Mode</th>
                  <th className="px-4 py-3 text-left">Transaction ID</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentHistory.map((payment) => {
                  const date = payment.date?.toDate ? payment.date.toDate() : new Date(payment.date);
                  return (
                    <tr key={payment.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">{Number.isFinite(date.getTime()) ? date.toLocaleString() : '—'}</td>
                      <td className="px-4 py-3">{payment.student_name}</td>
                      <td className="px-4 py-3">₹{Number(payment.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">{payment.mode || 'Online'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {payment.razorpay_payment_id || payment.transaction_id || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            payment.status === 'Success'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(payment)}
                          className="rounded-lg border border-cardinal px-3 py-1.5 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {paymentHistory.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      No payments match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
            <div className="mt-4 space-y-3">
              {notifications.length === 0 && (
                <p className="text-sm text-slate-500">No notifications at the moment.</p>
              )}
              {notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleNotificationRead}
                />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
            <form className="mt-4 space-y-4" onSubmit={handleProfileSave}>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Full name
                <input
                  value={profileForm.name}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  placeholder="Your name"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Contact number
                <input
                  value={profileForm.contactNumber}
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, contactNumber: event.target.value }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  placeholder="9876543210"
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {profileSaving ? 'Saving…' : 'Save profile'}
                </button>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="rounded-xl border border-cardinal px-4 py-2 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10"
                >
                  Reset password
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Help & Support</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-700">Frequently Asked Questions</p>
              <ul className="mt-3 space-y-3 text-sm text-slate-600">
                <li>
                  <p className="font-medium text-slate-800">How do I track my payments?</p>
                  <p className="text-slate-600">Use the payment history table above to review transactions and download receipts.</p>
                </li>
                <li>
                  <p className="font-medium text-slate-800">Can I pay partially?</p>
                  <p className="text-slate-600">Yes, select the fee items you wish to pay in the payment modal.</p>
                </li>
                <li>
                  <p className="font-medium text-slate-800">Who do I contact for technical help?</p>
                  <p className="text-slate-600">Submit the support form and our team will respond within one business day.</p>
                </li>
              </ul>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">School Accounts Desk</p>
                <p>Email: accounts@school.edu</p>
                <p>Phone: +91 98765 43210</p>
                <p>Timings: Mon-Fri · 9:00 AM – 5:00 PM</p>
              </div>
            </div>
            <form className="space-y-4" onSubmit={handleSupportSubmit}>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Subject
                <input
                  value={supportForm.subject}
                  onChange={(event) =>
                    setSupportForm((prev) => ({ ...prev, subject: event.target.value }))
                  }
                  required
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Message
                <textarea
                  value={supportForm.message}
                  onChange={(event) =>
                    setSupportForm((prev) => ({ ...prev, message: event.target.value }))
                  }
                  required
                  rows={4}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              </label>
              <button
                type="submit"
                disabled={supportSubmitting}
                className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {supportSubmitting ? 'Sending…' : 'Send message'}
              </button>
            </form>
          </div>
        </section>
      </main>

        <PayNowModal
          open={paymentContext.open}
          student={paymentContext.student}
          selections={paymentContext.selections}
          advanceOptions={paymentContext.advanceOptions}
          selectedAdvanceId={paymentContext.selectedAdvanceId}
          advanceEnabled={paymentContext.advanceEnabled}
          onAdvanceSelect={handleAdvanceSelection}
          onAdvanceToggle={handleToggleAdvance}
          onToggle={handleToggleSelection}
          onClose={handleClosePayment}
          onConfirm={handleProcessPayment}
          processing={paymentProcessing}
          total={totalSelectedAmount}
      />
    </div>
  );
};

export default dynamic(() => Promise.resolve(ParentDashboard), { ssr: false }); // ssr: false to prevent prerender
