import Razorpay from 'razorpay';

const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

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
      receipt: `eln-${userId}-${Date.now()}`,
      notes: {
        userId,
        studentId: studentId || '',
        studentDocId: studentDocId || '',
        studentName: studentName || '',
        parentEmail: parentEmail || '',
        term: term || '',
        breakdown: JSON.stringify(breakdown || []),
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
