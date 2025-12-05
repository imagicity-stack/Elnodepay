import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  createNotificationListener,
  fetchInquiryAnalytics,
  fetchPipeline,
  fetchUserRole,
  markNotificationRead,
  movePipelineCard,
} from '../../lib/admissionService';
import { auth } from '../../lib/firebase';
import PipelineBoard from '../../components/PipelineBoard';
import NotificationsPanel from '../../components/NotificationsPanel';

const useAdmissionGuard = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/unauthorized');
        return;
      }
      const roles = await fetchUserRole(currentUser.uid);
      if (!roles.includes('admission_manager')) {
        router.push('/unauthorized');
        return;
      }
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  return { loading, user };
};

const DashboardCard = ({ label, value, accent }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-sm font-semibold text-slate-500">{label}</p>
    <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    <div className={`mt-3 h-1.5 rounded-full ${accent}`} />
  </div>
);

const AdmissionDashboard = () => {
  const { loading } = useAdmissionGuard();
  const router = useRouter();
  const [analytics, setAnalytics] = useState({});
  const [pipeline, setPipeline] = useState({});
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    fetchInquiryAnalytics().then(setAnalytics);
    fetchPipeline().then(setPipeline);
    const unsub = createNotificationListener(setNotifications);
    return () => unsub();
  }, []);

  const handleMove = async (id, status) => {
    await movePipelineCard(id, status);
    const updated = await fetchPipeline();
    setPipeline(updated);
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading portal...</div>;
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <Head>
        <title>Admission Manager Portal</title>
      </Head>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Admission Manager Portal</p>
            <h1 className="text-3xl font-semibold text-slate-900">Dashboard</h1>
          </div>
          <div className="flex gap-2 text-sm font-semibold text-cardinal">
            <Link href="/admission-manager/inquiries" className="hover:underline">
              Inquiry list
            </Link>
            <Link href="/admission-manager/performance" className="hover:underline">
              Team performance
            </Link>
            <Link href="/admission-manager/bulk-actions" className="hover:underline">
              Bulk actions
            </Link>
            <Link href="/admission-manager/settings" className="hover:underline">
              Integration settings
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <DashboardCard label="Total inquiries" value={analytics.total || 0} accent="bg-emerald-100" />
          <DashboardCard label="New today" value={analytics.newToday || 0} accent="bg-blue-100" />
          <DashboardCard label="Pending follow-ups" value={analytics.pendingFollowUps || 0} accent="bg-amber-100" />
          <DashboardCard label="Upcoming visits" value={analytics.upcomingVisits || 0} accent="bg-indigo-100" />
          <DashboardCard label="Converted / admitted" value={analytics.converted || 0} accent="bg-emerald-200" />
          <DashboardCard label="Drop offs" value={analytics.dropOffs || 0} accent="bg-rose-100" />
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Conversion pipeline</h2>
            <Link href="/admission-manager/inquiries" className="text-sm font-semibold text-cardinal hover:underline">
              View inquiry list
            </Link>
          </div>
          <div className="mt-4">
            <PipelineBoard data={pipeline} onMove={handleMove} onOpen={(id) => router.push(`/admission-manager/inquiry/${id}`)} />
          </div>
        </div>

        <div className="mt-8">
          <NotificationsPanel notifications={notifications} onDismiss={markNotificationRead} />
        </div>
      </div>
    </div>
  );
};

export default AdmissionDashboard;
