import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import Layout from '../components/Layout';
import Card from '../components/Card';
import StatsGrid from '../components/StatsGrid';
import { auth, db } from '../lib/firebase';

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if (document.getElementById('razorpay-sdk')) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-sdk';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const ParentDashboard = () => {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/');
        return;
      }

      const profileRef = doc(db, 'users', user.uid);
      const profileSnap = await getDoc(profileRef);

      if (!profileSnap.exists()) {
        setMessage('Profile not found. Contact the school.');
        setLoading(false);
        return;
      }

      const profileData = profileSnap.data();
      if (profileData.role !== 'parent') {
        router.push('/accountant');
        return;
      }

      setUserProfile({ id: user.uid, email: user.email, ...profileData });
      setLoading(false);

      const txnQuery = query(
        collection(db, 'transactions'),
        where('user_id', '==', user.uid),
        orderBy('date', 'desc')
      );

      const unsubscribeTxn = onSnapshot(txnQuery, (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setTransactions(data);
      });

      return unsubscribeTxn;
    });

    return () => unsubscribe();
  }, [router]);

  const handlePayNow = useCallback(async () => {
    if (!userProfile || processing) {
      return;
    }

    setProcessing(true);
    setMessage('');

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setMessage('Unable to load Razorpay checkout. Check your connection.');
      setProcessing(false);
      return;
    }

    try {
      const response = await fetch('/api/createOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.max(userProfile.total_due, 0),
          userId: userProfile.id
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to initiate payment.');
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
        amount: data.order.amount,
        currency: data.order.currency,
        name: 'The Elden Heights School',
        description: 'School fee payment',
        order_id: data.order.id,
        prefill: {
          name: userProfile.student_name || userProfile.name,
          email: userProfile.email || auth.currentUser?.email || '',
          contact: userProfile.contact || ''
        },
        handler: async (responsePayload) => {
          try {
            const verifyResponse = await fetch('/api/verifyPayment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...responsePayload,
                orderId: data.order.id,
                userId: userProfile.id,
                amount: data.order.amount
              })
            });
            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok || !verifyData.success) {
              throw new Error(verifyData.message || 'Verification failed');
            }
            setMessage('Payment successful! Thank you.');
          } catch (err) {
            setMessage(err.message || 'Unable to verify payment.');
          } finally {
            setProcessing(false);
          }
        },
        notes: {
          student: userProfile.student_name,
          class: userProfile.class
        },
        theme: { color: '#A31F36' }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', (event) => {
        setMessage(event.error?.description || 'Payment failed. Please try again.');
        setProcessing(false);
      });
      razorpay.open();
    } catch (error) {
      setMessage(error.message || 'Unable to start payment.');
      setProcessing(false);
    }
  }, [processing, userProfile]);

  const markClearedMessage = async () => {
    if (!userProfile) return;
    await updateDoc(doc(db, 'users', userProfile.id), {
      total_due: 0
    });
  };

  if (loading) {
    return (
      <Layout title="Parent Dashboard">
        <p className="text-center text-slate-600">Loading your dashboard…</p>
      </Layout>
    );
  }

  if (!userProfile) {
    return (
      <Layout title="Parent Dashboard">
        <p className="text-center text-slate-600">{message || 'No profile to display.'}</p>
      </Layout>
    );
  }

  const stats = [
    {
      label: 'Pending Fee',
      value: `₹${(userProfile.total_due || 0).toLocaleString('en-IN')}`,
      helper: userProfile.next_due_date ? `Due by ${userProfile.next_due_date}` : 'No upcoming dues registered.'
    },
    {
      label: 'Student',
      value: userProfile.student_name || 'N/A',
      helper: userProfile.class ? `Class ${userProfile.class}` : ''
    },
    {
      label: 'Last Payment',
      value: transactions[0]?.date || 'No payments yet',
      helper: transactions[0]?.amount ? `₹${transactions[0].amount}` : ''
    },
    {
      label: 'Status',
      value: userProfile.total_due > 0 ? 'Payment Pending' : 'Cleared',
      helper: userProfile.total_due > 0 ? 'Please settle dues at the earliest.' : 'Thank you for staying up to date.'
    }
  ];

  return (
    <Layout title="Parent Dashboard">
      <div className="space-y-8">
        <StatsGrid stats={stats} />

        <Card
          title="Fee Summary"
          actions={
            <button
              type="button"
              onClick={handlePayNow}
              disabled={processing || userProfile.total_due <= 0}
              className="bg-cardinal text-white px-4 py-2 rounded-md font-semibold shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:bg-cardinal/60"
            >
              {processing ? 'Processing…' : userProfile.total_due > 0 ? 'Pay Now' : 'All Clear'}
            </button>
          }
        >
          <ul className="space-y-2 text-sm">
            <li><strong>Student Name:</strong> {userProfile.student_name}</li>
            <li><strong>Class:</strong> {userProfile.class}</li>
            <li><strong>Parent:</strong> {userProfile.name}</li>
            <li><strong>Contact:</strong> {userProfile.contact}</li>
            <li><strong>Total Due:</strong> ₹{userProfile.total_due}</li>
            <li><strong>Next Due Date:</strong> {userProfile.next_due_date || 'Not set'}</li>
          </ul>
          {message && <p className="text-sm text-cardinal font-medium">{message}</p>}
          <button
            type="button"
            onClick={markClearedMessage}
            className="text-xs text-cardinal/70 underline"
          >
            Mark as cleared (demo)
          </button>
        </Card>

        <Card title="Transaction History">
          {transactions.length === 0 ? (
            <p className="text-sm text-slate-500">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-cardinal/10 text-cardinal">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Amount</th>
                    <th className="px-4 py-2 text-left">Razorpay ID</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="border-b border-slate-100">
                      <td className="px-4 py-2">{txn.date}</td>
                      <td className="px-4 py-2">₹{txn.amount}</td>
                      <td className="px-4 py-2">{txn.razorpay_id || '—'}</td>
                      <td className="px-4 py-2 capitalize">{txn.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
};

export default ParentDashboard;
