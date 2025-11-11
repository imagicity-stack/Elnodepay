import crypto from 'crypto';
import { addDoc, arrayUnion, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const keySecret = process.env.RAZORPAY_KEY_SECRET;

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  if (!keySecret) {
    return res.status(500).json({ success: false, message: 'Razorpay secret missing' });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, amount } = req.body;

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

    const amountPaid = Number(amount || 0) / 100;
    const txnRef = await addDoc(collection(db, 'transactions'), {
      user_id: userId,
      amount: amountPaid,
      date: new Date().toISOString(),
      razorpay_id: razorpay_payment_id,
      status: 'success',
      order_id: razorpay_order_id
    });

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const newDue = Math.max((userData.total_due || 0) - amountPaid, 0);
      const collected = (userData.collected_amount || 0) + amountPaid;
      await updateDoc(userRef, {
        total_due: newDue,
        collected_amount: collected,
        transactions: arrayUnion(txnRef.id)
      });
    }

    return res.status(200).json({ success: true, transactionId: txnRef.id });
  } catch (error) {
    console.error('verifyPayment error', error);
    return res.status(500).json({ success: false, message: error.message || 'Unable to verify payment' });
  }
};

export default handler;
