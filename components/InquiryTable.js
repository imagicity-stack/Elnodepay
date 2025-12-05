import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const PAGE_SIZE = 10;

const normalizeValue = (value) => {
  if (!value) return '';
  if (value?.toDate) return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return value;
};

const sortData = (data, sortKey, direction) => {
  if (!sortKey) return data;
  return [...data].sort((a, b) => {
    const valA = normalizeValue(a[sortKey]);
    const valB = normalizeValue(b[sortKey]);
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    return 0;
  });
};

const InquiryTable = ({ inquiries = [], searchTerm, onSearch }) => {
  const [sortKey, setSortKey] = useState('createdAt');
  const [direction, setDirection] = useState('desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const sorted = useMemo(() => sortData(inquiries, sortKey, direction), [inquiries, sortKey, direction]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key) => {
    if (sortKey === key) {
      setDirection(direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setDirection('asc');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Inquiries</h3>
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => onSearch?.(e.target.value)}
          placeholder="Search parent name or phone"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:w-64 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {['Parent', 'Student', 'Class', 'Lead source', 'Status', 'Follow-up', 'Created'].map((header, index) => {
                const keyMap = ['parentName', 'studentName', 'classApplied', 'leadSource', 'status', 'followUpDate', 'createdAt'];
                const key = keyMap[index];
                return (
                  <th
                    key={header}
                    onClick={() => handleSort(key)}
                    className="cursor-pointer px-4 py-3 text-left font-semibold hover:text-cardinal"
                  >
                    {header}
                  </th>
                );
              })}
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {paginated.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-900">{item.parentName}</td>
                <td className="px-4 py-3 text-slate-700">{item.studentName}</td>
                <td className="px-4 py-3 text-slate-700">{item.classApplied}</td>
                <td className="px-4 py-3 text-slate-700">{item.leadSource}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">
                    {item.status || 'new'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {item.followUpDate ? new Date(item.followUpDate?.toDate?.() || item.followUpDate).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {item.createdAt
                    ? new Date(item.createdAt?.toDate?.() || item.createdAt).toLocaleDateString('en-IN')
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admission-manager/inquiry/${item.id}`} className="text-cardinal hover:underline">
                    Open profile
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
        <p className="text-slate-600">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-50"
            disabled={page === 1}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-50"
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default InquiryTable;
