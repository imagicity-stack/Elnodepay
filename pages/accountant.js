import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const initialFormState = {
  name: '',
  class: '',
  parent_email: '',
  total_due: '',
  next_due_date: '',
};

const AccountantDashboard = () => {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [error, setError] = useState('');
  const [formState, setFormState] = useState(initialFormState);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);

  useEffect(() => {
    let active = true;
    const studentsRef = collection(db, 'students');
    let unsubscribeStudents = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!active) return;

      if (unsubscribeStudents) {
        unsubscribeStudents();
        unsubscribeStudents = null;
      }

      if (!user) {
        setCheckingAuth(false);
        router.replace('/');
        return;
      }

      setCheckingAuth(false);
      setStudentsLoading(true);

      unsubscribeStudents = onSnapshot(
        studentsRef,
        (snapshot) => {
          if (!active) return;
          const studentDocs = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));
          setStudents(studentDocs);
          setStudentsLoading(false);
          setError('');
        },
        (snapshotError) => {
          console.error(snapshotError);
          if (!active) return;
          setError('Unable to load student data. Please try again later.');
          setStudents([]);
          setStudentsLoading(false);
        },
      );
    });

    return () => {
      active = false;
      if (unsubscribeStudents) {
        unsubscribeStudents();
      }
      unsubscribeAuth();
    };
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/';
  };

  const openAddStudentForm = () => {
    setFormState(initialFormState);
    setEditingStudentId(null);
    setIsFormOpen(true);
  };

  const openEditStudentForm = (student) => {
    setFormState({
      name: student.name || '',
      class: student.class || '',
      parent_email: student.parent_email || '',
      total_due: student.total_due ?? '',
      next_due_date: student.next_due_date || '',
    });
    setEditingStudentId(student.id);
    setIsFormOpen(true);
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: name === 'total_due' ? value.replace(/[^0-9.]/g, '') : value,
    }));
  };

  const handleFormSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        name: formState.name.trim(),
        class: formState.class.trim(),
        parent_email: formState.parent_email.trim(),
        total_due: Number(formState.total_due || 0),
        next_due_date: formState.next_due_date.trim(),
      };

      if (editingStudentId) {
        const studentRef = doc(db, 'students', editingStudentId);
        await updateDoc(studentRef, payload);
        alert('Student updated successfully.');
      } else {
        await addDoc(collection(db, 'students'), payload);
        alert('Student added successfully.');
      }

      setIsFormOpen(false);
      setFormState(initialFormState);
      setEditingStudentId(null);
    } catch (submitError) {
      console.error(submitError);
      alert('There was an issue saving the student. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    const shouldDelete = window.confirm('Are you sure you want to delete this student?');
    if (!shouldDelete) return;

    try {
      await deleteDoc(doc(db, 'students', studentId));
      alert('Student deleted successfully.');
    } catch (deleteError) {
      console.error(deleteError);
      alert('Unable to delete the student. Please try again.');
    }
  };

  const hasStudents = useMemo(() => students.length > 0, [students]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4 font-poppins text-cardinal">
        <Head>
          <title>Accountant Dashboard</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
            rel="stylesheet"
          />
        </Head>
        <div className="flex flex-col items-center gap-4">
          <span
            className="h-10 w-10 animate-spin rounded-full border-2 border-solid border-cardinal/50 border-t-transparent"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">Checking account access…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-10 font-poppins text-slate-800">
      <Head>
        <title>Accountant Dashboard</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-semibold text-cardinal">Accountant Dashboard</h1>
          <button
            type="button"
            onClick={openAddStudentForm}
            className="inline-flex items-center justify-center rounded-full bg-[#A31F36] px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#8c1a2f] focus:outline-none focus:ring-2 focus:ring-[#A31F36]/40"
          >
            Add Student
          </button>
        </header>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center justify-center rounded-full border border-[#A31F36] px-5 py-2 text-sm font-semibold text-[#A31F36] transition hover:bg-[#A31F36]/10 focus:outline-none focus:ring-2 focus:ring-[#A31F36]/40"
          >
            Sign Out
          </button>
        </div>

        <section className="rounded-3xl border border-[#A31F36]/15 bg-white p-6 shadow-lg">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#A31F36]">Student Accounts</h2>
              <p className="text-sm text-slate-600">Manage student records and payment details in real-time.</p>
            </div>
            {studentsLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span
                  className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#A31F36]/40 border-t-transparent"
                  aria-hidden="true"
                />
                Loading student data…
              </div>
            )}
          </div>

          {error && <p className="mb-4 text-sm font-medium text-red-600">{error}</p>}

          {!studentsLoading && !hasStudents && !error && (
            <p className="text-sm text-slate-600">No student data found. Use the &ldquo;Add Student&rdquo; button to get started.</p>
          )}

          {hasStudents && (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {students.map((student) => (
                <article
                  key={student.id}
                  className="flex flex-col rounded-2xl border border-[#A31F36]/15 bg-[#A31F36]/5 p-5 shadow-sm transition hover:border-[#A31F36]/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#A31F36]">
                        {student.name || 'Unnamed Student'}
                      </h3>
                      <p className="text-sm text-slate-600">Class: {student.class || 'Not set'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditStudentForm(student)}
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#A31F36] shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#A31F36]/40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStudent(student.id)}
                        className="rounded-full bg-[#A31F36] px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-[#8c1a2f] focus:outline-none focus:ring-2 focus:ring-[#A31F36]/40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <dl className="mt-4 space-y-2 text-sm text-slate-700">
                    <div className="flex justify-between">
                      <dt className="font-medium text-[#A31F36]">Parent Email</dt>
                      <dd className="text-right">{student.parent_email || 'Not set'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-medium text-[#A31F36]">Total Due</dt>
                      <dd className="text-right">
                        ₹{Number(student.total_due || 0).toLocaleString('en-IN')}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-medium text-[#A31F36]">Next Due Date</dt>
                      <dd className="text-right">{student.next_due_date || 'Not set'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#A31F36]">
                {editingStudentId ? 'Edit Student' : 'Add Student'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (isSubmitting) return;
                  setIsFormOpen(false);
                  setFormState(initialFormState);
                  setEditingStudentId(null);
                }}
                className="rounded-full px-3 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleFormSubmit}>
              <div>
                <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formState.name}
                  onChange={handleFormChange}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm shadow-sm transition focus:border-[#A31F36] focus:outline-none focus:ring-2 focus:ring-[#A31F36]/30"
                  placeholder="Enter student name"
                />
              </div>

              <div>
                <label htmlFor="class" className="mb-1 block text-sm font-medium text-slate-700">
                  Class
                </label>
                <input
                  id="class"
                  name="class"
                  type="text"
                  required
                  value={formState.class}
                  onChange={handleFormChange}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm shadow-sm transition focus:border-[#A31F36] focus:outline-none focus:ring-2 focus:ring-[#A31F36]/30"
                  placeholder="Enter class"
                />
              </div>

              <div>
                <label htmlFor="parent_email" className="mb-1 block text-sm font-medium text-slate-700">
                  Parent Email
                </label>
                <input
                  id="parent_email"
                  name="parent_email"
                  type="email"
                  required
                  value={formState.parent_email}
                  onChange={handleFormChange}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm shadow-sm transition focus:border-[#A31F36] focus:outline-none focus:ring-2 focus:ring-[#A31F36]/30"
                  placeholder="Enter parent email"
                />
              </div>

              <div>
                <label htmlFor="total_due" className="mb-1 block text-sm font-medium text-slate-700">
                  Total Due
                </label>
                <input
                  id="total_due"
                  name="total_due"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={formState.total_due}
                  onChange={handleFormChange}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm shadow-sm transition focus:border-[#A31F36] focus:outline-none focus:ring-2 focus:ring-[#A31F36]/30"
                  placeholder="Enter total due"
                />
              </div>

              <div>
                <label htmlFor="next_due_date" className="mb-1 block text-sm font-medium text-slate-700">
                  Next Due Date
                </label>
                <input
                  id="next_due_date"
                  name="next_due_date"
                  type="date"
                  required
                  value={formState.next_due_date}
                  onChange={handleFormChange}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm shadow-sm transition focus:border-[#A31F36] focus:outline-none focus:ring-2 focus:ring-[#A31F36]/30"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-full bg-[#A31F36] px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#8c1a2f] focus:outline-none focus:ring-2 focus:ring-[#A31F36]/40 disabled:cursor-not-allowed disabled:opacity-80"
              >
                {isSubmitting ? 'Saving…' : editingStudentId ? 'Save Changes' : 'Save Student'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountantDashboard;
