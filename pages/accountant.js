import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import Layout from '../components/Layout';
import Card from '../components/Card';
import StatsGrid from '../components/StatsGrid';
import { auth, db, messagingPromise } from '../lib/firebase';

const AccountantDashboard = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [sendingReminder, setSendingReminder] = useState('');

  useEffect(() => {
    let unsubscribeProfile = () => {};
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/');
        return;
      }
      setCurrentUser(user);
      const profileRef = doc(db, 'users', user.uid);
      unsubscribeProfile = onSnapshot(profileRef, (snapshot) => {
        if (!snapshot.exists()) {
          setMessage('Accountant profile not found.');
          setLoading(false);
          return;
        }
        const profile = snapshot.data();
        if (profile.role !== 'accountant') {
          router.push('/parent');
          return;
        }
        setLoading(false);
      });
    });

    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
  }, [router]);

  useEffect(() => {
    const studentsQuery = query(collection(db, 'users'), where('role', '==', 'parent'));
    const unsubscribeStudents = onSnapshot(studentsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      data.sort((a, b) => (a.student_name || '').localeCompare(b.student_name || ''));
      setStudents(data);
    });

    return () => unsubscribeStudents();
  }, []);

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) => {
      return (
        student.student_name?.toLowerCase().includes(term) ||
        student.name?.toLowerCase().includes(term) ||
        student.student_id?.toLowerCase().includes(term)
      );
    });
  }, [search, students]);

  const totals = useMemo(() => {
    const collected = students.reduce((sum, student) => sum + (student.collected_amount || 0), 0);
    const pending = students.reduce((sum, student) => sum + (student.total_due || 0), 0);
    return {
      collected,
      pending,
      students: students.length
    };
  }, [students]);

  const handleDueUpdate = async (studentId, amount) => {
    try {
      await updateDoc(doc(db, 'users', studentId), {
        total_due: Number(amount)
      });
      setMessage('Due amount updated.');
    } catch (error) {
      setMessage(error.message || 'Unable to update due.');
    }
  };

  const handleMarkReceived = async (student) => {
    try {
      await addDoc(collection(db, 'transactions'), {
        user_id: student.id,
        amount: student.total_due,
        date: new Date().toISOString(),
        razorpay_id: 'manual',
        status: 'received',
        created_at: serverTimestamp()
      });
      await updateDoc(doc(db, 'users', student.id), {
        total_due: 0,
        collected_amount: (student.collected_amount || 0) + student.total_due
      });
      setMessage(`Marked payment received for ${student.student_name}.`);
    } catch (error) {
      setMessage(error.message || 'Unable to mark payment received.');
    }
  };

  const handleSendReminder = async (student) => {
    try {
      setSendingReminder(student.id);
      const messaging = await messagingPromise;
      if (!messaging) {
        setMessage('Reminder service not supported in this browser.');
        setSendingReminder('');
        return;
      }
      // Placeholder stub for sending reminder
      console.info('Reminder sent to', student.contact);
      setMessage(`Reminder queued for ${student.student_name}.`);
    } catch (error) {
      setMessage(error.message || 'Unable to send reminder.');
    } finally {
      setSendingReminder('');
    }
  };

  if (loading) {
    return (
      <Layout title="Accountant Dashboard">
        <p className="text-center text-slate-600">Loading accountant tools…</p>
      </Layout>
    );
  }

  const stats = [
    {
      label: 'Students',
      value: totals.students,
      helper: 'Active parent accounts'
    },
    {
      label: 'Total Collected',
      value: `₹${totals.collected.toLocaleString('en-IN')}`,
      helper: 'Updated from transactions'
    },
    {
      label: 'Total Pending',
      value: `₹${totals.pending.toLocaleString('en-IN')}`,
      helper: 'Outstanding dues'
    },
    {
      label: 'Signed in as',
      value: currentUser?.email || 'Accountant',
      helper: 'Firebase authentication'
    }
  ];

  return (
    <Layout title="Accountant Dashboard">
      <div className="space-y-8">
        <StatsGrid stats={stats} />

        <Card title="Student Overview">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <input
              type="search"
              placeholder="Search by student name or ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full md:w-80 rounded-md border border-cardinal/40 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cardinal"
            />
            {message && <p className="text-sm text-cardinal font-medium">{message}</p>}
          </div>

          <div className="overflow-x-auto mt-6">
            <table className="min-w-full text-sm">
              <thead className="bg-cardinal/10 text-cardinal">
                <tr>
                  <th className="px-4 py-2 text-left">Student</th>
                  <th className="px-4 py-2 text-left">Class</th>
                  <th className="px-4 py-2 text-left">Total Due</th>
                  <th className="px-4 py-2 text-left">Next Due Date</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="border-b border-slate-100">
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-800">{student.student_name}</p>
                      <p className="text-xs text-slate-500">Parent: {student.name}</p>
                      {student.student_id && (
                        <p className="text-xs text-slate-400">ID: {student.student_id}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">{student.class || 'N/A'}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="0"
                        defaultValue={student.total_due || 0}
                        className="w-28 rounded-md border border-cardinal/40 px-2 py-1 text-right"
                        onBlur={(event) => handleDueUpdate(student.id, event.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">{student.next_due_date || 'Not set'}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleMarkReceived(student)}
                          className="bg-cardinal text-white px-3 py-1 rounded-md text-xs font-semibold hover:bg-cardinal/90"
                        >
                          Mark Received
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSendReminder(student)}
                          className="border border-cardinal text-cardinal px-3 py-1 rounded-md text-xs font-semibold hover:bg-cardinal/10"
                        >
                          {sendingReminder === student.id ? 'Sending…' : 'Send Reminder'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      No students found. Try a different search term.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default AccountantDashboard;
