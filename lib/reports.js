import { collection, doc, getDocs, orderBy, query, where } from 'firebase/firestore';

const formatDateKey = (date) => {
  const target = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(target.getTime())) {
    return { key: '', label: '' };
  }
  const year = target.getFullYear();
  const monthIndex = target.getMonth();
  const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const label = target.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  return { key, label };
};

const formatSequenceValue = (value) => String(value).padStart(4, '0');

const incrementCounter = async (db, runTransactionFn, counterKey) => {
  const countersRef = doc(db, 'settings', 'counters');
  return runTransactionFn(db, async (transaction) => {
    const snapshot = await transaction.get(countersRef);
    const data = snapshot.exists() ? snapshot.data() : {};
    const counters = data.counters || {};
    const current = Number.isFinite(Number(counters[counterKey])) ? Number(counters[counterKey]) : 0;
    const next = current + 1;
    transaction.set(
      countersRef,
      { counters: { ...counters, [counterKey]: next } },
      { merge: true },
    );
    return next;
  });
};

export async function getCollectionsInRange(db, collectionName, field, startISO, endISO) {
  const constraints = [];
  if (startISO) {
    constraints.push(where(field, '>=', startISO));
  }
  if (endISO) {
    constraints.push(where(field, '<=', endISO));
  }
  constraints.push(orderBy(field, 'asc'));
  // if index error, follow console link to create composite index
  const ref = query(collection(db, collectionName), ...constraints);
  const snapshot = await getDocs(ref);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export function groupByMonth(rows, dateField) {
  const monthMap = new Map();
  if (!Array.isArray(rows)) {
    return monthMap;
  }
  rows.forEach((row) => {
    const rawDate = row?.[dateField];
    const parsed = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
    if (!parsed || !Number.isFinite(parsed.getTime())) {
      return;
    }
    const { key, label } = formatDateKey(parsed);
    if (!key) return;
    const existing = monthMap.get(key) || { key, label, items: [], total: 0 };
    const amount = Number(row?.amount || 0);
    existing.items.push(row);
    if (Number.isFinite(amount)) {
      existing.total += amount;
    }
    monthMap.set(key, existing);
  });
  return monthMap;
}

const formatSequence = (prefix, sequence, date) => {
  const target = date instanceof Date ? date : new Date(date);
  const datePart = Number.isFinite(target.getTime())
    ? `${target.getFullYear()}${String(target.getMonth() + 1).padStart(2, '0')}${String(target.getDate()).padStart(2, '0')}`
    : '';
  return `${prefix}-${datePart}-${formatSequenceValue(sequence)}`;
};

export async function makeVoucherNo(db, runTransactionFn, date = new Date()) {
  const nextValue = await incrementCounter(db, runTransactionFn, 'voucher');
  return formatSequence('VCH', nextValue, date);
}

export async function makeExpenseId(db, runTransactionFn, date = new Date()) {
  const nextValue = await incrementCounter(db, runTransactionFn, 'expense');
  return formatSequence('EXP', nextValue, date);
}
