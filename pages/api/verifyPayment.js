import crypto from 'crypto';

const keySecret = process.env.RAZORPAY_KEY_SECRET;
const firebaseApiKey = process.env.FIREBASE_API_KEY;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseServiceEmail = process.env.FIREBASE_SERVICE_EMAIL;
const firebaseServicePassword = process.env.FIREBASE_SERVICE_PASSWORD;

const FIRESTORE_BASE = firebaseProjectId
  ? `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents`
  : '';

const getFirebaseIdToken = async () => {
  if (!firebaseApiKey) {
    throw new Error('Missing FIREBASE_API_KEY.');
  }
  if (!firebaseServiceEmail || !firebaseServicePassword) {
    throw new Error('Missing FIREBASE_SERVICE_EMAIL or FIREBASE_SERVICE_PASSWORD.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: firebaseServiceEmail,
        password: firebaseServicePassword,
        returnSecureToken: true,
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to authenticate with Firebase: ${errorBody}`);
  }

  const data = await response.json();
  if (!data.idToken) {
    throw new Error('Firebase authentication did not return an idToken.');
  }
  return data.idToken;
};

const encodeValue = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return { nullValue: null };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
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
      const fields = {};
      Object.entries(value).forEach(([key, nested]) => {
        const encoded = encodeValue(nested);
        if (encoded !== undefined) {
          fields[key] = encoded;
        }
      });
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
  if (!value || typeof value !== 'object') {
    return value;
  }
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) {
    const parsed = new Date(value.timestampValue);
    return Number.isFinite(parsed.getTime()) ? parsed : value.timestampValue;
  }
  if ('arrayValue' in value) {
    const list = value.arrayValue?.values || [];
    return list.map((item) => decodeValue(item));
  }
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields || {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, nested]) => [key, decodeValue(nested)]),
    );
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
  return { id: name?.split('/')?.pop() || '', ...data };
};

const firestoreFetch = async (path, idToken, { method = 'GET', body, headers, allowMissing = false } = {}) => {
  if (!firebaseProjectId) {
    throw new Error('Missing FIREBASE_PROJECT_ID.');
  }
  const url = `${FIRESTORE_BASE}${path}`;
  const finalHeaders = {
    Authorization: `Bearer ${idToken}`,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  };
  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    if (allowMissing && response.status === 404) {
      return null;
    }
    const errorBody = await response.text();
    throw new Error(`Firestore request failed (${response.status}): ${errorBody}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
};

const createDocument = async (idToken, collectionPath, data) => {
  const response = await firestoreFetch(`/${collectionPath}`, idToken, {
    method: 'POST',
    body: { fields: encodeFields(data) },
  });
  return parseDocument(response);
};

const getDocument = async (idToken, docPath) => {
  const response = await firestoreFetch(`/${docPath}`, idToken, { allowMissing: true });
  return response ? parseDocument(response) : null;
};

const buildUpdateMask = (fieldPaths = []) =>
  fieldPaths
    .filter(Boolean)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');

const updateDocument = async (idToken, docPath, data, fieldPaths = []) => {
  const query = buildUpdateMask(fieldPaths);
  const response = await firestoreFetch(`/${docPath}${query ? `?${query}` : ''}`, idToken, {
    method: 'PATCH',
    body: { fields: encodeFields(data) },
  });
  return response ? parseDocument(response) : null;
};

const runStructuredQuery = async (idToken, structuredQuery) => {
  const response = await firestoreFetch(':runQuery', idToken, {
    method: 'POST',
    body: { structuredQuery },
  });
  if (!Array.isArray(response)) {
    return [];
  }
  return response
    .map((entry) => parseDocument(entry.document))
    .filter(Boolean);
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (!firebaseServiceEmail || !firebaseServicePassword) {
    throw new Error('Missing FIREBASE_SERVICE_EMAIL or FIREBASE_SERVICE_PASSWORD.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: firebaseServiceEmail,
        password: firebaseServicePassword,
        returnSecureToken: true,
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to authenticate with Firebase: ${errorBody}`);
  }

  const data = await response.json();
  if (!data.idToken) {
    throw new Error('Firebase authentication did not return an idToken.');
  }
  return data.idToken;
};

const queryFeeRequests = async (idToken, field, value) => {
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
  return runStructuredQuery(idToken, structuredQuery);
};

const syncFeeRequestsAfterPayment = async ({
  idToken,
  studentDocId,
  studentId,
  amountPaid,
  paymentMode,
  paymentId,
}) => {
  if ((!studentDocId && !studentId) || !(amountPaid > 0)) {
    return;
  }

  const requestDocs = new Map();
  const queries = [];
  if (studentDocId) {
    queries.push(queryFeeRequests(idToken, 'student_doc_id', studentDocId));
  }
  if (studentId && studentId !== studentDocId) {
    queries.push(queryFeeRequests(idToken, 'studentId', studentId));
  }
  const docMatches = await Promise.all(queries.length ? queries : [Promise.resolve([])]);
  docMatches.flat().forEach((doc) => {
    if (doc?.id) {
      requestDocs.set(doc.id, doc);
    }
  });

  if (!requestDocs.size) {
    return;
  }

  const sortedRequests = Array.from(requestDocs.values()).sort((a, b) => {
    const dueA = parseDateValue(a.due_date);
    const dueB = parseDateValue(b.due_date);
    const createdA = parseDateValue(a.created_at);
    const createdB = parseDateValue(b.created_at);
    const timeA = (dueA || createdA || new Date(0)).getTime();
    const timeB = (dueB || createdB || new Date(0)).getTime();
    return timeA - timeB;
  });

  let remaining = amountPaid;
  const now = new Date();
  for (const request of sortedRequests) {
    if (remaining <= 0) {
      break;
    }
    const total = calculateFeeRequestTotal(request);
    const outstanding = resolveRequestBalance(request, total);
    if (outstanding <= 0) {
      continue;
    }
    if (remaining >= outstanding) {
      await updateDocument(
        idToken,
        `fee_requests/${request.id}`,
        {
          status: 'Paid',
          paid_at: now,
          payment_mode: paymentMode || 'Online',
          transaction_id: paymentId || '',
          balance: 0,
          updated_at: now,
        },
        ['status', 'paid_at', 'payment_mode', 'transaction_id', 'balance', 'updated_at'],
      );
      remaining -= outstanding;
    } else {
      const newBalance = outstanding - remaining;
      await updateDocument(
        idToken,
        `fee_requests/${request.id}`,
        {
          balance: newBalance,
          status: 'Pending',
          payment_mode: paymentMode || 'Online',
          transaction_id: paymentId || '',
          updated_at: now,
        },
        ['balance', 'status', 'payment_mode', 'transaction_id', 'updated_at'],
      );
      remaining = 0;
    }
  }
};

const createPaymentDocument = async (
  idToken,
  {
    studentId,
    studentName,
    className,
    parentUid,
    parentEmail,
    userId,
    amount,
    paymentMode,
    term,
    feeType,
    breakdown,
    razorpay_order_id,
    razorpay_payment_id,
  },
) => {
  const now = new Date();
  const sanitizedBreakdown = Array.isArray(breakdown)
    ? breakdown.map((item) => ({
        label: item.label || '',
        amount: parseAmountValue(item.amount),
        type: item.type || 'tuition',
      }))
    : [];

  const paymentDoc = await createDocument(idToken, 'payments', {
    studentId: studentId || '',
    student_name: studentName || '',
    class: className || '',
    parent_uid: parentUid || userId || '',
    parent_email: parentEmail || '',
    amount: parseAmountValue(amount),
    mode: paymentMode || 'Online',
    date: now,
    term: term || '',
    fee_type: feeType || 'Tuition',
    breakdown: sanitizedBreakdown,
    razorpay_order_id: razorpay_order_id || '',
    razorpay_payment_id: razorpay_payment_id || '',
    status: 'Success',
  });

  return paymentDoc?.id || null;
};

const updateStudentBalance = async ({ idToken, studentDocId, amountPaid }) => {
  if (!studentDocId || !(amountPaid > 0)) {
    return;
  }
  const studentDoc = await getDocument(idToken, `students/${studentDocId}`);
  if (!studentDoc) {
    return;
  }
  const currentBalance = parseAmountValue(studentDoc.balance ?? studentDoc.fee_amount ?? 0);
  const newBalance = Math.max(currentBalance - amountPaid, 0);
  const currentStatus = `${studentDoc.status || ''}`;
  const updatedStatus = newBalance <= 0 ? 'Paid' : currentStatus === 'Overdue' ? 'Overdue' : 'Pending';
  await updateDocument(
    idToken,
    `students/${studentDocId}`,
    {
      balance: newBalance,
      status: updatedStatus,
      updated_at: new Date(),
    },
    ['balance', 'status', 'updated_at'],
  );
};

const createTransactionLogEntry = async (
  idToken,
  {
    studentDocId,
    studentId,
    studentName,
    className,
    amount,
    paymentMode,
    paymentId,
  },
) => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  await createDocument(idToken, 'transactions_log', {
    student_doc_id: studentDocId || '',
    studentId: studentId || '',
    student_name: studentName || '',
    class: className || '',
    amount: parseAmountValue(amount),
    mode: paymentMode || 'Online',
    transaction_id: paymentId || '',
    status: 'Success',
    month_key: monthKey,
    month_label: monthLabel,
    date: now,
    created_at: now,
  });
};

const createNotification = async (idToken, { userId, studentName, amount }) => {
  if (!userId) return;
  const now = new Date();
  await createDocument(idToken, 'notifications', {
    user_uid: userId,
    type: 'info',
    title: 'Payment received',
    message: `Payment of ₹${parseAmountValue(amount).toFixed(2)} received for ${studentName || 'student'}.`,
    created_at: now,
    read: false,
  });
};

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  if (!keySecret) {
    return res.status(500).json({ success: false, message: 'Razorpay secret missing' });
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId = '',
      amount = 0,
      studentDocId = '',
      studentId = '',
      studentName = '',
      parentEmail = '',
      parentUid = '',
      className = '',
      term = '',
      feeType = 'Tuition',
      breakdown = [],
      paymentMode = 'Online',
    } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Incomplete Razorpay payload' });
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user reference' });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto.createHmac('sha256', keySecret).update(body).digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Signature mismatch' });
    }

    const idToken = await getFirebaseIdToken();
    const amountPaid = parseAmountValue(amount);

    const paymentId = await createPaymentDocument(idToken, {
      studentId: studentId || studentDocId,
      studentName,
      className,
      parentUid,
      parentEmail,
      userId,
      amount: amountPaid,
      paymentMode,
      term,
      feeType,
      breakdown,
      razorpay_order_id,
      razorpay_payment_id,
    });

    await updateStudentBalance({ idToken, studentDocId, amountPaid });

    await syncFeeRequestsAfterPayment({
      idToken,
      studentDocId,
      studentId: studentId || studentDocId,
      amountPaid,
      paymentMode,
      paymentId: razorpay_payment_id,
    });

    await createTransactionLogEntry(idToken, {
      studentDocId,
      studentId: studentId || studentDocId,
      studentName,
      className,
      amount: amountPaid,
      paymentMode,
      paymentId: razorpay_payment_id,
    });

    await createNotification(idToken, {
      userId: parentUid || userId,
      studentName,
      amount: amountPaid,
    });

    return res.status(200).json({ success: true, paymentId });
  } catch (error) {
    console.error('verifyPayment error', error);
    return res.status(500).json({ success: false, message: error.message || 'Unable to verify payment' });
  }
};

export default handler;
