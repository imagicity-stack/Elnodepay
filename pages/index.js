import { useState } from 'react';
import { useRouter } from 'next/router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import Layout from '../components/Layout';
import Card from '../components/Card';
import { auth, db } from '../lib/firebase';

const LoginPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, 'users', credential.user.uid));

      if (!userDoc.exists()) {
        throw new Error('User profile missing. Contact school administration.');
      }

      const profile = userDoc.data();
      if (profile.role === 'accountant') {
        router.push('/accountant');
      } else {
        router.push('/parent');
      }
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Login">
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <div className="space-y-6">
          <h2 className="text-3xl font-semibold text-cardinal">Welcome to EL-NODE Pay</h2>
          <p className="text-lg text-slate-600">
            Parents can securely pay student fees, view transaction history, and stay updated with upcoming
            dues. Accountants manage fee records, track payments, and send reminders.
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-lg bg-cardinal text-white shadow">
              <h3 className="font-semibold">For Parents</h3>
              <p className="text-white/80 mt-2">Track dues, pay instantly with Razorpay, and download receipts.</p>
            </div>
            <div className="p-4 rounded-lg bg-cardinal/10 text-cardinal shadow">
              <h3 className="font-semibold">For Accountants</h3>
              <p className="mt-2 text-cardinal/80">Manage student balances, confirm payments, and send reminders.</p>
            </div>
          </div>
        </div>
        <Card title="Sign in">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-600">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                className="mt-1 w-full rounded-md border border-cardinal/40 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cardinal"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-600">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                className="mt-1 w-full rounded-md border border-cardinal/40 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cardinal"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cardinal text-white font-semibold rounded-md py-2 shadow hover:bg-cardinal/90 disabled:cursor-wait"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </Card>
      </div>
    </Layout>
  );
};

export default LoginPage;
