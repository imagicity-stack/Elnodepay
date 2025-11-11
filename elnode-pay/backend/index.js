import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import admin from 'firebase-admin';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.warn('⚠️  Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment.');
}

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

if (!admin.apps.length && FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

const firestore = admin.apps.length ? admin.firestore() : null;

const createTransactionRecord = async ({ userId, orderId, amount }) => {
  if (!firestore) return null;
  const transactionRef = firestore.collection('transactions').doc();
  await transactionRef.set({
    txn_id: transactionRef.id,
    user_id: userId,
    amount,
    date: new Date().toISOString(),
    razorpay_id: orderId,
    status: 'created'
  });
  return transactionRef.id;
};

const markTransactionPaid = async ({ orderId, paymentId, signature }) => {
  if (!firestore) return;
  const transactions = await firestore
    .collection('transactions')
    .where('razorpay_id', '==', orderId)
    .limit(1)
    .get();

  if (!transactions.empty) {
    const docSnap = transactions.docs[0];
    await docSnap.ref.update({
      status: 'paid',
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      date: new Date().toISOString()
    });

    const userId = docSnap.data().user_id;
    if (userId) {
      const userRef = firestore.collection('users').doc(userId);
      await firestore.runTransaction(async (transaction) => {
        const userSnapshot = await transaction.get(userRef);
        if (userSnapshot.exists) {
          const currentDue = userSnapshot.data().total_due || 0;
          transaction.update(userRef, {
            total_due: Math.max(0, currentDue - docSnap.data().amount)
          });
        }
      });
    }
  }
};

app.get('/', (_req, res) => {
  res.json({ status: 'EL-NODE Pay backend is running' });
});

app.post('/createOrder', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes = {}, userId } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const options = {
      amount: Math.round(amount * 100),
      currency,
      receipt: receipt || `elnodepay_${Date.now()}`,
      notes
    };

    const order = await razorpay.orders.create(options);

    const transactionId = await createTransactionRecord({ userId, orderId: order.id, amount });

    res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      transactionId
    });
  } catch (error) {
    console.error('Create order error', error);
    res.status(500).json({ error: error.message || 'Unable to create order' });
  }
});

app.post('/verifyPayment', async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: 'orderId, paymentId and signature are required' });
    }

    const generatedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (generatedSignature !== signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    await markTransactionPaid({ orderId, paymentId, signature });

    res.json({ status: 'Payment verified successfully' });
  } catch (error) {
    console.error('Verify payment error', error);
    res.status(500).json({ error: error.message || 'Unable to verify payment' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`EL-NODE Pay backend running on port ${PORT}`);
});
