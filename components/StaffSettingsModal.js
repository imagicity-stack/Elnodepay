import { useEffect, useMemo, useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const CATEGORY_PREFIX = {
  Admin: 'AD',
  Teacher: 'TE',
  'Non Teaching': 'NT',
};

const NON_TEACHING_ROLES = ['Bus Driver', 'Conductor', 'Maid', 'Peon', 'Guard'];

const defaultForm = {
  id: null,
  staffId: '',
  fullName: '',
  gender: '',
  address: '',
  phoneNumber: '',
  email: '',
  category: 'Admin',
  subRole: '',
  subject: '',
  employmentType: '',
};

const generateStaffId = (category = 'Admin') => {
  const prefix = CATEGORY_PREFIX[category] || 'ST';
  const random = Math.floor(100 + Math.random() * 900);
  return `EHS${prefix}${random}`;
};

const StaffSettingsModal = ({ open, onClose, secondaryAuth }) => {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const staffRef = collection(db, 'staff');
    const unsub = onSnapshot(query(staffRef, orderBy('fullName', 'asc')), (snapshot) => {
      const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setStaff(rows);
    });
    return unsub;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setFeedback('');
    setForm((prev) => ({
      ...defaultForm,
      staffId: prev.id ? prev.staffId : generateStaffId(prev.category || 'Admin'),
    }));
  }, [open]);

  const isTeacher = useMemo(() => form.category === 'Teacher', [form.category]);
  const isNonTeaching = useMemo(() => form.category === 'Non Teaching', [form.category]);

  const handleField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCategoryChange = (value) => {
    setForm((prev) => ({
      ...prev,
      category: value,
      subRole: '',
      subject: '',
      email: value === 'Non Teaching' ? '' : prev.email,
      staffId: prev.id ? prev.staffId : generateStaffId(value),
    }));
  };

  const handleEdit = (row) => {
    setFeedback('');
    setForm({
      id: row.id,
      staffId: row.staffId,
      fullName: row.fullName || '',
      gender: row.gender || '',
      address: row.address || '',
      phoneNumber: row.phoneNumber || '',
      email: row.email || '',
      category: row.designationCategory || 'Admin',
      subRole: row.subRole || '',
      subject: row.subject || '',
      employmentType: row.employmentType || '',
    });
  };

  const ensureStaffAccount = async (email, fullName, staffId, category) => {
    if (!email) return null;
    const existingUserSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));
    const existingUser = existingUserSnap.docs[0];
    if (existingUser) {
      await setDoc(
        doc(db, 'users', existingUser.id),
        { name: fullName, staffId, category, role: 'staff', updated_at: serverTimestamp() },
        { merge: true },
      );
      return existingUser.id;
    }

    if (!secondaryAuth) return null;
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, 'elnstaff123');
    await setDoc(
      doc(db, 'users', credential.user.uid),
      {
        email,
        name: fullName,
        staffId,
        category,
        role: 'staff',
        authUid: credential.user.uid,
        created_at: serverTimestamp(),
      },
      { merge: true },
    );
    return credential.user.uid;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback('');

    const payload = {
      staffId: form.staffId || generateStaffId(form.category),
      fullName: form.fullName.trim(),
      gender: form.gender,
      address: form.address,
      phoneNumber: form.phoneNumber,
      email: isNonTeaching ? '' : form.email.toLowerCase(),
      designationCategory: form.category,
      subRole: isTeacher ? form.subject || 'Teacher' : isNonTeaching ? form.subRole || 'Non Teaching' : form.subRole,
      subject: isTeacher ? form.subject : '',
      employmentType: form.employmentType,
      updatedAt: serverTimestamp(),
    };

    if (!payload.fullName) {
      setSaving(false);
      setFeedback('Full name is required.');
      return;
    }

    try {
      const staffDocRef = doc(db, 'staff', form.id || payload.staffId);
      const authUid = await ensureStaffAccount(payload.email, payload.fullName, payload.staffId, payload.designationCategory);
      if (authUid) {
        payload.authUid = authUid;
      }
      if (!form.id) {
        payload.createdAt = serverTimestamp();
      }
      await setDoc(staffDocRef, payload, { merge: true });
      setFeedback('Staff details saved successfully.');
      setForm({ ...defaultForm, staffId: generateStaffId(payload.designationCategory) });
    } catch (error) {
      console.error('Unable to save staff record', error);
      const message =
        error?.code === 'auth/email-already-in-use'
          ? 'Email already in use. Update the user in Firebase Authentication.'
          : 'Unable to save staff record. Please try again.';
      setFeedback(message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setForm(defaultForm);
    setFeedback('');
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Staff Settings</h2>
            <p className="text-sm text-slate-600">Add, edit, or update staff details for salary processing.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-2">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Staff ID
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={form.staffId}
                    onChange={(event) => handleField('staffId', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    placeholder="EHSAD123"
                  />
                  <button
                    type="button"
                    onClick={() => handleField('staffId', generateStaffId(form.category))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Regenerate
                  </button>
                </div>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Staff name
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(event) => handleField('fullName', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  placeholder="Jane Doe"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Gender
                <select
                  value={form.gender}
                  onChange={(event) => handleField('gender', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Employment Type
                <select
                  value={form.employmentType}
                  onChange={(event) => handleField('employmentType', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  <option value="">Select type</option>
                  <option value="Full Time">Full Time</option>
                  <option value="Part Time">Part Time</option>
                  <option value="Contract">Contract</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Address
                <input
                  type="text"
                  value={form.address}
                  onChange={(event) => handleField('address', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  placeholder="Street, City"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Phone number
                <input
                  type="tel"
                  value={form.phoneNumber}
                  onChange={(event) => handleField('phoneNumber', event.target.value.replace(/[^0-9+]/g, ''))}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  placeholder="9876543210"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Category
                <select
                  value={form.category}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                >
                  {Object.keys(CATEGORY_PREFIX).map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              {!isNonTeaching && (
                <label className="text-sm font-semibold text-slate-700">
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => handleField('email', event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    placeholder="staff@example.com"
                  />
                </label>
              )}
            </div>

            {isTeacher ? (
              <label className="text-sm font-semibold text-slate-700">
                Subject
                <input
                  type="text"
                  value={form.subject}
                  onChange={(event) => handleField('subject', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  placeholder="Mathematics"
                />
              </label>
            ) : (
              <label className="text-sm font-semibold text-slate-700">
                Sub Role
                {isNonTeaching ? (
                  <select
                    value={form.subRole}
                    onChange={(event) => handleField('subRole', event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  >
                    <option value="">Select role</option>
                    {NON_TEACHING_ROLES.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.subRole}
                    onChange={(event) => handleField('subRole', event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                    placeholder="Coordinator"
                  />
                )}
              </label>
            )}

            {feedback && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{feedback}</div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save staff'}
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...defaultForm, staffId: generateStaffId(form.category) })}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Clear form
              </button>
            </div>
          </form>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Staff Directory</h3>
                <p className="text-sm text-slate-600">Select a row to edit staff details.</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[480px] overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Staff ID', 'Name', 'Category', 'Sub Role', 'Employment', 'Action'].map((heading) => (
                        <th key={heading} className="px-4 py-2 text-left font-semibold text-slate-700">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {staff.map((row) => (
                      <tr key={row.id} className="hover:bg-cardinal/5">
                        <td className="px-4 py-2 font-semibold text-slate-900">{row.staffId}</td>
                        <td className="px-4 py-2 text-slate-700">{row.fullName}</td>
                        <td className="px-4 py-2 text-slate-700">{row.designationCategory}</td>
                        <td className="px-4 py-2 text-slate-700">{row.subRole || row.subject || '—'}</td>
                        <td className="px-4 py-2 text-slate-700">{row.employmentType || '—'}</td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(row)}
                            className="rounded-lg border border-cardinal px-3 py-1.5 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!staff.length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                          No staff records yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffSettingsModal;
