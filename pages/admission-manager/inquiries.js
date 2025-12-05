import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import Filters from '../../components/Filters';
import InquiryTable from '../../components/InquiryTable';
import { auth } from '../../lib/firebase';
import { fetchInquiries, fetchUserRole } from '../../lib/admissionService';

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

const InquiryListPage = () => {
  const { loading } = useAdmissionGuard();
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState('');
  const [inquiries, setInquiries] = useState([]);

  useEffect(() => {
    const load = async () => {
      const data = await fetchInquiries(
        {
          ...filters,
          dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
          dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
        },
        search,
      );
      setInquiries(data);
    };

    load();
  }, [filters, search]);

  if (loading) return <div className="p-6 text-sm">Checking permissions...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <Head>
        <title>Inquiry list</title>
      </Head>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Admission Manager Portal</p>
            <h1 className="text-3xl font-semibold text-slate-900">Inquiry list</h1>
          </div>
          <Link href="/admission-manager" className="text-sm font-semibold text-cardinal hover:underline">
            Back to dashboard
          </Link>
        </div>
        <div className="mt-4">
          <Filters onChange={setFilters} />
          <InquiryTable inquiries={inquiries} searchTerm={search} onSearch={setSearch} />
        </div>
      </div>
    </div>
  );
};

export default InquiryListPage;
