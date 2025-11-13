import Razorpay from 'razorpay';

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return res.status(500).json({ success: false, message: 'Razorpay keys not configured' });
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

    console.log('[Razorpay] Creating order', {
      userId,
      studentId: studentId || studentDocId || 'unknown',
      amount,
      breakdownCount: Array.isArray(breakdown) ? breakdown.length : 0,
    });

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

    console.log('[Razorpay] Order created', {
      orderId: order?.id,
      amount: order?.amount,
      currency: order?.currency,
    });

    return res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('[Razorpay] createOrder error', error);
    return res.status(500).json({ success: false, message: error.message || 'Unable to create order' });
  }
};

export default handler;
