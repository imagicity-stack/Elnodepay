import crypto from 'crypto';

const {
  RAZORPAY_KEY_SECRET_BHAGWATI,
  FIREBASE_API_KEY,
  FIREBASE_PROJECT_ID,
  FIREBASE_SERVICE_EMAIL,
  FIREBASE_SERVICE_PASSWORD,
} = process.env;

const FIRESTORE_BASE = FIREBASE_PROJECT_ID
  ? `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`
  : '';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const timestampNow = () => new Date().toISOString();

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const roundCurrency = (value) => Math.max(0, Math.round(toNumber(value) * 100) / 100);

function buildError(message) {
  return new Error(message || 'Unexpected error');
}

async function getFirebaseIdToken() {
  if (!FIREBASE_API_KEY) {
    throw buildError('Missing Firebase API key.');
  }
  if (!FIREBASE_SERVICE_EMAIL || !FIREBASE_SERVICE_PASSWORD) {
    throw buildError('Missing Firebase service account credentials.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: FIREBASE_SERVICE_EMAIL,
        password: FIREBASE_SERVICE_PASSWORD,
        returnSecureToken: true,
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw buildError(`Firebase authentication failed: ${details}`);
  }

  const data = await response.json();
  if (!data.idToken) {
    throw buildError('Firebase authentication did not return an idToken.');
  }
  return data.idToken;
}

const encodeValue = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => encodeValue(item)) } };
  }
  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'number':
      return Number.isInteger(value) ? { integerValue: value.toString() } : { doubleValue: value };
    case 'boolean':
      return { booleanValue: value };
    case 'object': {
      const fields = encodeFields(value);
      return { mapValue: { fields } };
    }
    default:
      return { stringValue: String(value) };
  }
};

const encodeFields = (data = {}) => {
  const fields = {};
  Object.entries(data).forEach(([key, value]) => {
    const encoded = encodeValue(value);
    if (encoded !== undefined) {
      fields[key] = encoded;
    }
  });
  return fields;
};

const decodeValue = (value) => {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) {
    const result = {};
    const fields = value.mapValue.fields || {};
    Object.entries(fields).forEach(([k, v]) => {
      result[k] = decodeValue(v);
    });
    return result;
  }
  if ('arrayValue' in value) {
    const values = value.arrayValue.values || [];
    return values.map((item) => decodeValue(item));
  }
  if ('nullValue' in value) return null;
  return value;
};

const parseDocument = (document) => {
  if (!document) return null;
  const { name, fields = {} } = document;
  const data = {};
  Object.entries(fields).forEach(([key, value]) => {
    data[key] = decodeValue(value);
  });
  return { id: (name || '').split('/').pop() || '', ...data };
};

async function firestoreRequest(idToken, path, { method = 'GET', body, allowMissing = false } = {}) {
  if (!FIRESTORE_BASE) {
    throw buildError('Missing Firestore configuration.');
  }
  const response = await fetch(`${FIRESTORE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    if (allowMissing && response.status === 404) {
      return null;
    }
    const details = await response.text();
    throw buildError(`Firestore request failed (${response.status}): ${details}`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function firestoreGetDocument(idToken, docPath) {
  const response = await firestoreRequest(idToken, `/${docPath}`, { allowMissing: true });
  return response ? parseDocument(response) : null;
}

async function firestoreCreateDocument(idToken, collection, data) {
  const response = await firestoreRequest(idToken, `/${collection}`, {
    method: 'POST',
    body: { fields: encodeFields(data) },
  });
  return parseDocument(response);
}

async function firestoreUpdateDocument(idToken, docPath, data, fieldMask = []) {
  const maskQuery = Array.isArray(fieldMask) && fieldMask.length
    ? `?${fieldMask.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&')}`
    : '';
  const response = await firestoreRequest(idToken, `/${docPath}${maskQuery}`, {
    method: 'PATCH',
    body: { fields: encodeFields(data) },
  });
  return response ? parseDocument(response) : null;
}

async function firestoreRunQuery(idToken, structuredQuery) {
  const response = await firestoreRequest(idToken, ':runQuery', {
    method: 'POST',
    body: { structuredQuery },
  });
  if (!Array.isArray(response)) {
    return [];
  }
  return response
    .map((entry) => parseDocument(entry.document))
    .filter(Boolean);
}

const validateSignature = ({ orderId, paymentId, signature }) => {
  if (!RAZORPAY_KEY_SECRET_BHAGWATI) {
    throw buildError('Razorpay secret not configured.');
  }
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET_BHAGWATI).update(body).digest('hex');
  if (expectedSignature !== signature) {
    throw buildError('Razorpay signature verification failed.');
  }
};

async function createPaymentEntry(idToken, payload) {
  const nowIso = timestampNow();
  const normalizedBreakdown = Array.isArray(payload.breakdown)
    ? payload.breakdown.map((item) => ({
        label: String(item.label || ''),
        amount: roundCurrency(item.amount),
        type: item.type || '',
      }))
    : [];

  const paymentDoc = await firestoreCreateDocument(idToken, 'payments', {
    studentId: payload.studentId || payload.studentDocId || '',
    student_name: payload.studentName || '',
    class: payload.className || '',
    parent_uid: payload.parentUid || '',
    parent_email: payload.parentEmail || '',
    amount: roundCurrency(payload.amount),
    mode: payload.paymentMode || 'Online',
    date: nowIso,
    term: payload.term || '',
    fee_type: payload.feeType || '',
    payment_type: payload.paymentType || 'fees',
    breakdown: normalizedBreakdown,
    razorpay_order_id: payload.razorpay_order_id || '',
    razorpay_payment_id: payload.razorpay_payment_id || '',
    inquiry_id: payload.inquiryId || '',
    status: 'Success',
  });
  return paymentDoc?.id || '';
}

async function markInquiryRegistered(idToken, { inquiryId, paymentId, amount }) {
  if (!inquiryId) {
    return;
  }
  const payload = {
    status: 'registered',
    tokenStatus: 'paid',
    token_payment_id: paymentId || '',
    token_amount: roundCurrency(amount),
    registered_at: timestampNow(),
  };
  await firestoreUpdateDocument(
    idToken,
    `inquiries/${inquiryId}`,
    payload,
    ['status', 'tokenStatus', 'token_payment_id', 'token_amount', 'registered_at'],
  );
  await firestoreCreateDocument(idToken, `inquiries/${inquiryId}/timeline`, {
    message: 'Token payment received',
    text: 'Token payment received',
    type: 'payment',
    userId: 'system',
    createdAt: timestampNow(),
  });
}

async function updateStudentAccount(idToken, studentDocId, amountPaid) {
  if (!studentDocId) {
    throw buildError('Student reference missing.');
  }
  const studentDoc = await firestoreGetDocument(idToken, `students/${studentDocId}`);
  if (!studentDoc) {
    throw buildError('Student record not found.');
  }
  const currentBalance = toNumber(studentDoc.balance ?? studentDoc.amount_total ?? 0);
  const newBalance = roundCurrency(currentBalance - amountPaid);
  const status = newBalance <= 0 ? 'Paid' : 'Pending';
  const payload = {
    balance: newBalance,
    status,
    updated_at: timestampNow(),
  };
  await firestoreUpdateDocument(idToken, `students/${studentDocId}`, payload, ['balance', 'status', 'updated_at']);
  return { balance: newBalance, status };
}

const parseDateInput = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const addMonthsToDate = (value, months = 1) => {
  const base = parseDateInput(value) || new Date();
  const result = new Date(base.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
};

async function fetchFeeRequests(idToken, field, value) {
  if (!value) return [];
  const structuredQuery = {
    from: [{ collectionId: 'fee_requests' }],
    where: {
      fieldFilter: {
        field: { fieldPath: field },
        op: 'EQUAL',
        value: encodeValue(value),
      },
    },
  };
  return firestoreRunQuery(idToken, structuredQuery);
}

async function reconcileFeeRequests({
  idToken,
  studentDocId,
  studentId,
  amountPaid,
  paymentMode,
  transactionId,
}) {
  if (!(amountPaid > 0)) {
    return;
  }
  const queryField = studentDocId ? 'student_doc_id' : studentId ? 'studentId' : null;
  const queryValue = studentDocId || studentId;

  if (!queryField || !queryValue) {
    return;
  }

  const feeRequests = await fetchFeeRequests(idToken, queryField, queryValue);
  if (!feeRequests.length) {
    return;
  }

  const nowIso = timestampNow();
  const sorted = feeRequests.sort((a, b) => {
    const dueA = parseDateInput(a.due_date) || parseDateInput(a.created_at) || new Date(0);
    const dueB = parseDateInput(b.due_date) || parseDateInput(b.created_at) || new Date(0);
    return dueA.getTime() - dueB.getTime();
  });

  let remaining = roundCurrency(amountPaid);
  for (const request of sorted) {
    if (remaining <= 0) break;
    const outstanding = roundCurrency(request.balance ?? request.amount_total ?? 0);
    if (outstanding <= 0) continue;

    const deduction = Math.min(remaining, outstanding);
    const newBalance = roundCurrency(outstanding - deduction);
    const updates = {
      balance: newBalance,
      status: newBalance <= 0 ? 'Paid' : 'Pending',
      payment_mode: paymentMode,
      transaction_id: transactionId || '',
      updated_at: nowIso,
    };
    const fieldMask = ['balance', 'status', 'payment_mode', 'transaction_id', 'updated_at'];
    if (newBalance <= 0) {
      updates.paid_at = nowIso;
      fieldMask.push('paid_at');
    }
    await firestoreUpdateDocument(idToken, `fee_requests/${request.id}`, updates, fieldMask);
    remaining = roundCurrency(remaining - deduction);
  }
}

async function createTransactionLogEntry({
  idToken,
  studentDocId,
  studentId,
  studentName,
  className,
  amount,
  paymentMode,
  transactionId,
}) {
  const date = new Date();
  const isoDate = date.toISOString();
  const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
  await firestoreCreateDocument(idToken, 'transactions_log', {
    student_doc_id: studentDocId || '',
    studentId: studentId || studentDocId || '',
    student_name: studentName || '',
    class: className || '',
    amount: roundCurrency(amount),
    mode: paymentMode || 'Online',
    transaction_id: transactionId || '',
    month_key: monthKey,
    month_label: monthLabel,
    status: 'Success',
    date: isoDate,
    created_at: isoDate,
  });
}

async function pushNotification({ idToken, parentUid, studentName, amount }) {
  if (!parentUid) return;
  const nowIso = timestampNow();
  await firestoreCreateDocument(idToken, 'notifications', {
    user_uid: parentUid,
    type: 'info',
    title: 'Payment received',
    message: `Payment of ₹${roundCurrency(amount).toFixed(2)} received for ${studentName || 'student'}.`,
    created_at: nowIso,
    read: false,
  });
}

async function applyAdvancePayment({
  idToken,
  studentDocId,
  studentId,
  studentName,
  className,
  parentUid,
  parentEmail,
  months,
  cycle,
  amount,
  paymentId,
}) {
  const monthsValue = Number(months || 0);
  if (!(monthsValue > 0) || !studentDocId) {
    return;
  }

  const studentDoc = await firestoreGetDocument(idToken, `students/${studentDocId}`);
  if (!studentDoc) {
    throw buildError('Student record not found for advance payment.');
  }

  const now = new Date();
  const existingCoverageEnd = parseDateInput(studentDoc.advance_plan_end);
  const baseDate = existingCoverageEnd && existingCoverageEnd.getTime() > now.getTime()
    ? existingCoverageEnd
    : now;
  const coverageEnd = addMonthsToDate(baseDate, monthsValue);

  const updatePayload = {
    advance_plan_months: monthsValue,
    advance_plan_cycle: cycle || `${monthsValue} Months`,
    advance_plan_amount: roundCurrency(amount),
    advance_plan_end: coverageEnd.toISOString(),
    advance_plan_updated_at: timestampNow(),
    advance_plan_payment_id: paymentId || '',
  };

  await firestoreUpdateDocument(
    idToken,
    `students/${studentDocId}`,
    updatePayload,
    [
      'advance_plan_months',
      'advance_plan_cycle',
      'advance_plan_amount',
      'advance_plan_end',
      'advance_plan_updated_at',
      'advance_plan_payment_id',
    ],
  );

  await firestoreCreateDocument(idToken, 'advance_payments', {
    student_doc_id: studentDocId,
    studentId: studentId || studentDocId,
    student_name: studentName || '',
    class: className || '',
    months: monthsValue,
    cycle: cycle || `${monthsValue} Months`,
    amount: roundCurrency(amount),
    razorpay_payment_id: paymentId || '',
    parent_uid: parentUid || '',
    parent_email: parentEmail || '',
    coverage_start: baseDate.toISOString(),
    coverage_end: coverageEnd.toISOString(),
    created_at: timestampNow(),
  });
}

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      studentDocId,
      studentId,
      studentName,
      className,
      inquiryId,
      parentUid,
      parentEmail,
      amount,
      term,
      feeType,
      breakdown,
      paymentMode,
      advancePayment,
    } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Incomplete Razorpay payload.' });
    }
    const isInquiryPayment = !!inquiryId && !studentDocId;

    if (!studentDocId && !isInquiryPayment) {
      return res.status(400).json({ success: false, message: 'Missing student reference.' });
    }
    const amountPaid = roundCurrency(amount);
    if (!(amountPaid > 0)) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount.' });
    }

    validateSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    const idToken = await getFirebaseIdToken();

    const paymentId = await createPaymentEntry(idToken, {
      studentId,
      studentDocId,
      studentName,
      className,
      parentUid,
      parentEmail,
      amount: amountPaid,
      term,
      feeType,
      breakdown,
      paymentMode: paymentMode || 'Online',
      razorpay_order_id,
      razorpay_payment_id,
      inquiryId,
    });

    if (isInquiryPayment) {
      await markInquiryRegistered(idToken, {
        inquiryId,
        paymentId: razorpay_payment_id || paymentId,
        amount: amountPaid,
      });
      return res.status(200).json({ success: true, paymentId: paymentId || razorpay_payment_id });
    }

    await updateStudentAccount(idToken, studentDocId, amountPaid);

    await reconcileFeeRequests({
      idToken,
      studentDocId,
      studentId,
      amountPaid,
      paymentMode: paymentMode || 'Online',
      transactionId: razorpay_payment_id,
    });

    await createTransactionLogEntry({
      idToken,
      studentDocId,
      studentId,
      studentName,
      className,
      amount: amountPaid,
      paymentMode: paymentMode || 'Online',
      transactionId: razorpay_payment_id,
    });

    if (advancePayment?.months) {
      await applyAdvancePayment({
        idToken,
        studentDocId,
        studentId,
        studentName,
        className,
        parentUid,
        parentEmail,
        months: Number(advancePayment.months || 0),
        cycle: advancePayment.cycle,
        amount: Number(advancePayment.amount || 0),
        paymentId: razorpay_payment_id,
      });
    }

    await pushNotification({
      idToken,
      parentUid,
      studentName,
      amount: amountPaid,
    });

    return res.status(200).json({ success: true, paymentId: paymentId || razorpay_payment_id });
  } catch (error) {
    console.error('verifyPayment error:', error?.message || error);
    return res.status(500).json({ success: false, message: error?.message || 'Unable to verify payment.' });
  }
};

export default handler;
