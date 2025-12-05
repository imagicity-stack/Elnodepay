import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import PerformanceCard from '../../components/PerformanceCard';
import { auth } from '../../lib/firebase';
import { fetchPerformance, fetchUserRole } from '../../lib/admissionService';

const useAdmissionGuard = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/unauthorized');
        return;
      }
      const roles = await fetchUserRole(user.uid);
      if (!roles.includes('admission_manager')) {
        router.push('/unauthorized');
        return;
      }
      setLoading(false);
    });
    return () => unsub();
  }, [router]);
  return { loading };
};

const PerformancePage = () => {
  const { loading } = useAdmissionGuard();
  const [stats, setStats] = useState([]);

  useEffect(() => {
    fetchPerformance().then(setStats);
  }, []);

  if (loading) return <div className="p-6 text-sm">Checking permissions...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <Head>
        <title>Team performance</title>
      </Head>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Admission Manager Portal</p>
            <h1 className="text-3xl font-semibold text-slate-900">Team performance</h1>
          </div>
          <a href="/admission-manager" className="text-sm font-semibold text-cardinal hover:underline">
            Back to dashboard
          </a>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((entry) => (
            <PerformanceCard key={entry.counsellor} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PerformancePage;
