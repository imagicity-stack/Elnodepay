import crypto from 'crypto';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

const parseDateValue = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    const parsed = value.toDate();
    return Number.isFinite(parsed?.getTime?.()) ? parsed : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const parseAmountValue = (value) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const calculateFeeRequestTotal = (request = {}) => {
  const directTotal = parseAmountValue(request.amount_total ?? request.amount);
  if (directTotal > 0) {
    return directTotal;
  }
  const base = parseAmountValue(request.base_amount);
  const custom = parseAmountValue(request.custom_amount);
  const extras = parseAmountValue(request.extras_total);
  if (base + custom + extras > 0) {
    return base + custom + extras;
  }
  const breakdown = request.breakdown && typeof request.breakdown === 'object' ? request.breakdown : {};
  return Object.values(breakdown).reduce((sum, item) => sum + parseAmountValue(item?.amount), 0);
};

const resolveRequestBalance = (request = {}, fallbackAmount = 0) => {
  const explicitFields = [
    request.balance,
    request.outstanding,
    request.remaining_amount,
    request.amount_due,
  ];
  for (const field of explicitFields) {
    const amount = parseAmountValue(field);
    if (amount > 0) {
      return amount;
    }
  }
  const status = `${request.status || ''}`.toLowerCase();
  if (status === 'paid' || status === 'success') {
    return 0;
  }
  return Math.max(parseAmountValue(fallbackAmount), 0);
};

const syncFeeRequestsAfterPayment = async ({
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
  if (studentDocId) {
    const snapshot = await getDocs(
      query(collection(db, 'fee_requests'), where('student_doc_id', '==', studentDocId)),
    );
    snapshot.forEach((docSnap) => {
      requestDocs.set(docSnap.id, docSnap);
    });
  }
  if (studentId && studentId !== studentDocId) {
    const snapshot = await getDocs(
      query(collection(db, 'fee_requests'), where('studentId', '==', studentId)),
    );
    snapshot.forEach((docSnap) => {
      requestDocs.set(docSnap.id, docSnap);
    });
  }
  if (!requestDocs.size) {
    return;
  }

  const sortedRequests = Array.from(requestDocs.values()).sort((a, b) => {
    const dataA = a.data();
    const dataB = b.data();
    const dueA = parseDateValue(dataA.due_date);
    const dueB = parseDateValue(dataB.due_date);
    const timeA = dueA ? dueA.getTime() : parseDateValue(dataA.created_at)?.getTime() || 0;
    const timeB = dueB ? dueB.getTime() : parseDateValue(dataB.created_at)?.getTime() || 0;
    return timeA - timeB;
  });

  let remaining = amountPaid;
  for (const docSnap of sortedRequests) {
    if (remaining <= 0) {
      break;
    }
    const data = docSnap.data();
    const total = calculateFeeRequestTotal(data);
    const outstanding = resolveRequestBalance(data, total);
    if (outstanding <= 0) {
      continue;
    }
    if (remaining >= outstanding) {
      await updateDoc(doc(db, 'fee_requests', docSnap.id), {
        status: 'Paid',
        paid_at: serverTimestamp(),
        payment_mode: paymentMode || 'Online',
        transaction_id: paymentId || '',
        balance: 0,
        updated_at: serverTimestamp(),
      });
      remaining -= outstanding;
    } else {
      const newBalance = outstanding - remaining;
      await updateDoc(doc(db, 'fee_requests', docSnap.id), {
        balance: newBalance,
        status: 'Pending',
        payment_mode: paymentMode || 'Online',
        transaction_id: paymentId || '',
        updated_at: serverTimestamp(),
      });
      remaining = 0;
    }
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

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      return res.status(500).json({ success: false, message: 'Razorpay secret missing' });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Incomplete Razorpay payload' });
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user reference' });
    }

    console.log('[Razorpay] Verifying payment', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      userId,
      amount,
      paymentMode,
    });

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto.createHmac('sha256', keySecret).update(body).digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.warn('[Razorpay] Signature mismatch', {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      });
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

    await syncFeeRequestsAfterPayment({
      studentDocId,
      studentId,
      amountPaid,
      paymentMode: paymentMode || 'Online',
      paymentId: razorpay_payment_id || '',
    });

    console.log('[Razorpay] Payment verified and recorded', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      amount: amountPaid,
      paymentMode: paymentMode || 'Online',
      paymentDocId: paymentDoc.id,
    });

    const eventDate = new Date();
    const monthKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = eventDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    await addDoc(collection(db, 'transactions_log'), {
      student_doc_id: studentDocId || '',
      studentId: studentId || '',
      student_name: studentName || '',
      class: className || '',
      amount: amountPaid,
      mode: paymentMode || 'Online',
      transaction_id: razorpay_payment_id || '',
      status: 'Success',
      month_key: monthKey,
      month_label: monthLabel,
      date: serverTimestamp(),
      created_at: serverTimestamp(),
    });

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
    console.error('[Razorpay] verifyPayment error', error);
    return res.status(500).json({ success: false, message: error.message || 'Unable to verify payment' });
  }
};

export default handler;
