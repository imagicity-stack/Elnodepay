import crypto from 'crypto';

const keySecret = process.env.RAZORPAY_KEY_SECRET;
const firebaseApiKey = process.env.FIREBASE_API_KEY;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseServiceEmail = process.env.FIREBASE_SERVICE_EMAIL;
const firebaseServicePassword = process.env.FIREBASE_SERVICE_PASSWORD;

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

const createPaymentDocument = async (idToken, fields) => {
  if (!firebaseProjectId) {
    throw new Error('Missing FIREBASE_PROJECT_ID.');
  }
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/payments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ fields }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to write payment document: ${errorBody}`);
  }

  return response.json();
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
      studentId = '',
      amount = 0,
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
    const amountValue = Number(amount || 0);
    const firestoreFields = {
      razorpay_order_id: { stringValue: String(razorpay_order_id) },
      razorpay_payment_id: { stringValue: String(razorpay_payment_id) },
      razorpay_signature: { stringValue: String(razorpay_signature) },
      status: { stringValue: 'success' },
      amount: { integerValue: String(Math.round(amountValue)) },
      userId: { stringValue: String(userId) },
      studentId: { stringValue: String(studentId || '') },
      createdAt: { timestampValue: new Date().toISOString() },
    };

    await createPaymentDocument(idToken, firestoreFields);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('verifyPayment error', error);
    return res.status(500).json({ success: false, message: error.message || 'Unable to verify payment' });
  }
};

export default handler;
