import crypto from 'crypto';

const {
  RAZORPAY_KEY_SECRET,
  FIREBASE_API_KEY,
  FIREBASE_PROJECT_ID,
  FIREBASE_SERVICE_EMAIL,
  FIREBASE_SERVICE_PASSWORD,
} = process.env;

const FIRESTORE_BASE = FIREBASE_PROJECT_ID
  ? `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`
  : '';

const timestampNow = () => new Date().toISOString();

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const roundCurrency = (value) => Math.max(0, Math.round(toNumber(value) * 100) / 100);

const buildError = (message) => new Error(message || 'Unexpected error');

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

async function firestoreRequest(idToken, path, { method = 'GET', body } = {}) {
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
    const details = await response.text();
    throw buildError(`Firestore request failed (${response.status}): ${details}`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function firestoreUpdateDocument(idToken, docPath, data, fieldMask = []) {
  const maskQuery = Array.isArray(fieldMask) && fieldMask.length
    ? `?${fieldMask.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&')}`
    : '';
  return firestoreRequest(idToken, `/${docPath}${maskQuery}`, {
    method: 'PATCH',
    body: { fields: encodeFields(data) },
  });
}

async function firestoreCreateDocument(idToken, collection, data) {
  return firestoreRequest(idToken, `/${collection}`, {
    method: 'POST',
    body: { fields: encodeFields(data) },
  });
}

const validateSignature = ({ orderId, paymentId, signature }) => {
  if (!RAZORPAY_KEY_SECRET) {
    throw buildError('Razorpay secret not configured.');
  }
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(body).digest('hex');
  if (expectedSignature !== signature) {
    throw buildError('Razorpay signature verification failed.');
  }
};

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
      storeOrderId,
      amount,
      parentUid,
      parentEmail,
      studentDocId,
      studentId,
      studentName,
      className,
      items = [],
    } = req.body || {};

    if (!storeOrderId) {
      return res.status(400).json({ success: false, message: 'Missing store order reference.' });
    }

    validateSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    const idToken = await getFirebaseIdToken();
    const paidAt = timestampNow();

    await firestoreUpdateDocument(
      idToken,
      `store_orders/${storeOrderId}`,
      {
        status: 'Paid',
        paid_at: paidAt,
        payment_mode: 'Online',
        razorpay_order_id: razorpay_order_id || '',
        razorpay_payment_id: razorpay_payment_id || '',
      },
      ['status', 'paid_at', 'payment_mode', 'razorpay_order_id', 'razorpay_payment_id'],
    );

    const breakdown = Array.isArray(items)
      ? items.map((item) => ({
          label: item.itemName || item.name || 'Store Item',
          amount: roundCurrency(item.price),
          type: 'store',
        }))
      : [];

    await firestoreCreateDocument(idToken, 'payments', {
      student_doc_id: studentDocId || '',
      studentId: studentId || studentDocId || '',
      student_name: studentName || '',
      class: className || '',
      parent_uid: parentUid || '',
      parent_email: parentEmail || '',
      amount: roundCurrency(amount),
      mode: 'Online',
      date: paidAt,
      fee_type: 'Store',
      payment_type: 'store',
      breakdown,
      razorpay_order_id: razorpay_order_id || '',
      razorpay_payment_id: razorpay_payment_id || '',
      store_order_id: storeOrderId,
      status: 'Success',
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('verifyStorePayment error', error);
    return res.status(500).json({ success: false, message: error.message || 'Unable to verify payment' });
  }
};

export default handler;
