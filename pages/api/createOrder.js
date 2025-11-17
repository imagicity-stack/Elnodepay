import Razorpay from 'razorpay';
import crypto from 'crypto';

const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

const MAX_RECEIPT_LENGTH = 40;

const buildReceiptId = (userId) => {
  const base = `eln-${userId || 'anon'}-${Date.now()}`;

  if (base.length <= MAX_RECEIPT_LENGTH) {
    return base;
  }

  const suffix = crypto.randomBytes(4).toString('hex');
  const availableLength = MAX_RECEIPT_LENGTH - suffix.length - 1; // keep room for the hyphen
  return `${base.slice(0, Math.max(0, availableLength))}-${suffix}`;
};

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  if (!keyId || !keySecret) {
    return res.status(500).json({
      success: false,
      message: 'Razorpay keys are missing. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment.',
    });
  }

  try {
    const {
      amount,
      userId,
      studentId,
      studentDocId,
      studentName,
      parentEmail,
      breakdown = [],
      term,
      advancePayment = null,
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing user reference' });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency: 'INR',
      receipt: buildReceiptId(userId),
      notes: {
        userId,
        studentId: studentId || '',
        studentDocId: studentDocId || '',
        studentName: studentName || '',
        parentEmail: parentEmail || '',
        term: term || '',
        breakdown: JSON.stringify(breakdown || []),
        advancePayment: advancePayment ? JSON.stringify(advancePayment) : '',
      },
    });

    return res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('createOrder error', error);
    const fallbackMessage = error?.error?.description || error?.message || 'Unable to create order';
    return res.status(500).json({ success: false, message: fallbackMessage });
  }
};

export default handler;
