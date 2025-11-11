import crypto from 'crypto';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
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
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      amount,
      studentDocId,
      studentId,
      studentName,
      parentEmail,
      parentUid,
      className,
      term,
      feeType,
      breakdown = [],
      paymentMode = 'Online',
    } = req.body;

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

    const amountPaid = Number(amount || 0);

    const paymentDoc = await addDoc(collection(db, 'payments'), {
      studentId: studentId || '',
      student_name: studentName || '',
      class: className || '',
      parent_uid: parentUid || userId || '',
      parent_email: parentEmail || '',
      amount: amountPaid,
      mode: paymentMode || 'Online',
      date: serverTimestamp(),
      term: term || '',
      fee_type: feeType || 'Tuition',
      breakdown,
      razorpay_order_id,
      razorpay_payment_id,
      status: 'Success',
    });

    if (studentDocId) {
      const studentRef = doc(db, 'students', studentDocId);
      const studentSnap = await getDoc(studentRef);
      if (studentSnap.exists()) {
        const studentData = studentSnap.data();
        const currentBalance = Number(studentData.balance ?? studentData.fee_amount ?? 0);
        const newBalance = Math.max(currentBalance - amountPaid, 0);
        const updatedStatus = newBalance <= 0 ? 'Paid' : studentData.status === 'Overdue' ? 'Overdue' : 'Pending';
        await updateDoc(studentRef, {
          balance: newBalance,
          status: updatedStatus,
        });
      }
    }

    if (parentUid || userId) {
      await addDoc(collection(db, 'notifications'), {
        user_uid: parentUid || userId,
        type: 'info',
        title: 'Payment received',
        message: `Payment of ₹${amountPaid.toFixed(2)} received for ${studentName || 'student'}.`,
        created_at: serverTimestamp(),
        read: false,
      });
    }

    return res.status(200).json({ success: true, paymentId: paymentDoc.id });
  } catch (error) {
    console.error('verifyPayment error', error);
    return res.status(500).json({ success: false, message: error.message || 'Unable to verify payment' });
  }
};

export default handler;
