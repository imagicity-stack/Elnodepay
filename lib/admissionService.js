import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { auth, db } from './firebase';

const INQUIRIES_COLLECTION = 'inquiries';
const VISITS_COLLECTION = 'visits';
const SETTINGS_COLLECTION = 'settings';
const NOTIFICATIONS_COLLECTION = 'notifications';

const toTimestamp = (value) => {
  if (!value) return null;
  if (value?.toDate) return value;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? Timestamp.fromDate(parsed) : null;
};

export const fetchUserRole = async (uid) => {
  if (!uid) return null;
  const userDoc = await getDoc(doc(db, 'users', uid));
  const data = userDoc.exists() ? userDoc.data() : {};
  if (typeof data?.role === 'string') {
    return data.role;
  }
  if (Array.isArray(data?.roles) && data.roles.length) {
    return data.roles[0] || null;
  }
  return null;
};

export const requireAdmissionManager = async () => {
  return new Promise((resolve, reject) => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        unsubscribe();
        reject(new Error('unauthenticated'));
        return;
      }
      const role = await fetchUserRole(user.uid);
      unsubscribe();
      if (role === 'admission_manager') {
        resolve(user);
      } else {
        reject(new Error('unauthorized'));
      }
    });
  });
};

const parseDate = (value) => {
  if (!value) return null;
  if (value?.toDate) {
    const parsed = value.toDate();
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

export const fetchInquiryAnalytics = async () => {
  const inquiries = await getDocs(collection(db, INQUIRIES_COLLECTION));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let total = 0;
  let newToday = 0;
  let pendingFollowUps = 0;
  let upcomingVisits = 0;
  let converted = 0;
  let dropOffs = 0;
  inquiries.forEach((docSnap) => {
    total += 1;
    const data = docSnap.data();
    const created = parseDate(data.createdAt);
    const status = data.status || 'new';
    if (created && created >= today) {
      newToday += 1;
    }
    if (status === 'converted' || status === 'admitted') {
      converted += 1;
    }
    if (status === 'closed' || status === 'drop_off') {
      dropOffs += 1;
    }
    if (data.followUpDate) {
      const followDate = parseDate(data.followUpDate);
      if (followDate && followDate <= new Date()) {
        pendingFollowUps += 1;
      }
    }
    if (data.nextVisitDate) {
      const visitDate = parseDate(data.nextVisitDate);
      if (visitDate && visitDate >= today) {
        upcomingVisits += 1;
      }
    }
  });
  return { total, newToday, pendingFollowUps, upcomingVisits, converted, dropOffs };
};

const buildInquiryQuery = (filters = {}, searchTerm = '') => {
  const constraints = [];
  if (filters.classApplied) {
    constraints.push(where('classApplied', '==', filters.classApplied));
  }
  if (filters.leadSource) {
    constraints.push(where('leadSource', '==', filters.leadSource));
  }
  if (filters.status && filters.status !== 'all') {
    constraints.push(where('status', '==', filters.status));
  }
  if (filters.location) {
    constraints.push(where('location', '==', filters.location));
  }
  let orderField = 'createdAt';

  if (filters.followUpDueToday) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    constraints.push(where('followUpDate', '>=', Timestamp.fromDate(start)));
    constraints.push(where('followUpDate', '<=', Timestamp.fromDate(end)));
    orderField = 'followUpDate';
  }
  if (filters.dateFrom && filters.dateTo) {
    const fromTs = toTimestamp(filters.dateFrom);
    const toTs = toTimestamp(filters.dateTo);
    if (fromTs && toTs) {
      constraints.push(where('createdAt', '>=', fromTs));
      constraints.push(where('createdAt', '<=', toTs));
      orderField = 'createdAt';
    }
  }
  const baseCollection = collection(db, INQUIRIES_COLLECTION);
  if (searchTerm) {
    return query(baseCollection, ...constraints, orderBy(orderField, 'desc'), orderBy('parentName'));
  }
  return query(baseCollection, ...constraints, orderBy(orderField, 'desc'));
};

export const fetchInquiries = async (filters = {}, searchTerm = '') => {
  const q = buildInquiryQuery(filters, searchTerm);
  const snapshot = await getDocs(q);
  const term = searchTerm.trim().toLowerCase();
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((item) => {
      if (!term) return true;
      const haystack = `${item.parentName || ''} ${item.phone || ''}`.toLowerCase();
      return haystack.includes(term);
    });
};

export const fetchInquiry = async (id) => {
  const ref = doc(db, INQUIRIES_COLLECTION, id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const saveInquiry = async (id, payload) => {
  const ref = doc(db, INQUIRIES_COLLECTION, id);
  await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
};

export const addTimelineEntry = async (id, entry) => {
  const ref = doc(db, INQUIRIES_COLLECTION, id);
  await updateDoc(ref, {
    timeline: arrayUnion({ ...entry, createdAt: serverTimestamp() }),
  });
};

export const addNote = async (id, note) => {
  const ref = doc(db, INQUIRIES_COLLECTION, id);
  await updateDoc(ref, {
    notes: arrayUnion({ text: note, createdAt: serverTimestamp() }),
  });
};

export const scheduleFollowUp = async (id, followUp) => {
  await saveInquiry(id, {
    followUpDate: toTimestamp(followUp.date) || null,
    followUpStatus: followUp.status || 'pending',
  });
  await addTimelineEntry(id, {
    type: 'follow_up',
    label: followUp.status || 'Follow up scheduled',
    meta: { followUpDate: followUp.date },
  });
};

export const createVisit = async (visit) => {
  const visitRef = await addDoc(collection(db, VISITS_COLLECTION), {
    ...visit,
    date: toTimestamp(visit.date) || visit.date,
    createdAt: serverTimestamp(),
  });
  if (visit.inquiryId) {
    await saveInquiry(visit.inquiryId, {
      nextVisitDate: toTimestamp(visit.date) || visit.date,
      status: 'visit_scheduled',
      visitId: visitRef.id,
    });
  }
  return visitRef.id;
};

export const updateVisitStatus = async (inquiryId, status) => {
  await saveInquiry(inquiryId, {
    visitStatus: status,
    status: status === 'completed' ? 'contacted' : status === 'no_show' ? 'follow_up' : 'visit_scheduled',
  });
  await addTimelineEntry(inquiryId, {
    type: 'visit',
    label: `Visit ${status}`,
  });
};

export const uploadDocument = async (inquiryId, file) => {
  const storage = getStorage();
  const fileRef = ref(storage, `inquiries/${inquiryId}/${file.name}`);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  await addTimelineEntry(inquiryId, {
    type: 'document_upload',
    label: `${file.name} uploaded`,
    meta: { url },
  });
  return url;
};

export const updateDocumentStatus = async (inquiryId, statuses) => {
  await saveInquiry(inquiryId, {
    documentStatuses: statuses,
  });
  await addTimelineEntry(inquiryId, {
    type: 'document_status',
    label: 'Document status updated',
    meta: statuses,
  });
};

export const updateTokenPayment = async (inquiryId, payment) => {
  await saveInquiry(inquiryId, {
    tokenPayment: payment?.date ? { ...payment, date: toTimestamp(payment.date) } : payment,
    status: payment?.status === 'paid' ? 'token_paid' : 'follow_up',
  });
  await addTimelineEntry(inquiryId, {
    type: 'payment',
    label: payment?.status === 'paid' ? 'Token payment recorded' : 'Token payment pending',
    meta: payment,
  });
};

export const fetchPipeline = async () => {
  const snapshot = await getDocs(collection(db, INQUIRIES_COLLECTION));
  const columns = {
    new: [],
    contacted: [],
    follow_up: [],
    visit_scheduled: [],
    token_paid: [],
    admitted: [],
    closed: [],
  };
  snapshot.forEach((docSnap) => {
    const data = { id: docSnap.id, ...docSnap.data() };
    const status = data.status || 'new';
    if (!columns[status]) {
      columns[status] = [];
    }
    columns[status].push(data);
  });
  return columns;
};

export const movePipelineCard = async (inquiryId, status) => {
  await saveInquiry(inquiryId, { status });
  await addTimelineEntry(inquiryId, { type: 'status_change', label: `Moved to ${status}` });
};

export const fetchPerformance = async () => {
  const snapshot = await getDocs(collection(db, INQUIRIES_COLLECTION));
  const stats = {};
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const counsellor = data.assignedCounsellor || 'Unassigned';
    if (!stats[counsellor]) {
      stats[counsellor] = {
        counsellor,
        calls: 0,
        leads: 0,
        conversions: 0,
        pendingFollowUps: 0,
        responseTimes: [],
      };
    }
    stats[counsellor].leads += 1;
    if (data.followUpStatus === 'pending') {
      stats[counsellor].pendingFollowUps += 1;
    }
    if (data.status === 'admitted' || data.status === 'converted' || data.status === 'token_paid') {
      stats[counsellor].conversions += 1;
    }
    if (Array.isArray(data.timeline)) {
      const callEvents = data.timeline.filter((item) => item.type === 'call');
      stats[counsellor].calls += callEvents.length;
      const response = data.timeline.find((item) => item.type === 'response');
      if (response?.meta?.minutes) {
        stats[counsellor].responseTimes.push(response.meta.minutes);
      }
    }
  });
  return Object.values(stats).map((entry) => ({
    ...entry,
    responseTime: entry.responseTimes.length
      ? Math.round(entry.responseTimes.reduce((sum, value) => sum + value, 0) / entry.responseTimes.length)
      : null,
  }));
};

export const fetchSettings = async () => {
  const snap = await getDoc(doc(db, SETTINGS_COLLECTION, 'admission'));
  return snap.exists()
    ? snap.data()
    : { leadSources: [], landingLabels: {}, customTags: [] };
};

export const saveSettings = async (payload) => {
  const ref = doc(db, SETTINGS_COLLECTION, 'admission');
  await setDoc(ref, payload, { merge: true });
};

export const createNotificationListener = (onChange) => {
  const q = query(collection(db, NOTIFICATIONS_COLLECTION), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    onChange(notifications);
  });
};

export const markNotificationRead = async (id) => {
  await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, id), { read: true, readAt: serverTimestamp() });
};

export const createOfferLetterRecord = async (inquiryId, url) => {
  await saveInquiry(inquiryId, { offerLetterURL: url });
  await addTimelineEntry(inquiryId, { type: 'offer_letter', label: 'Offer letter generated', meta: { url } });
};

export const confirmAdmission = async (inquiryId, payload) => {
  await saveInquiry(inquiryId, {
    status: 'admitted',
    admittedAt: serverTimestamp(),
    assignedClass: payload.className,
  });
  await addTimelineEntry(inquiryId, { type: 'admission', label: 'Admission confirmed' });
  await addDoc(collection(db, 'parent_portal'), {
    inquiryId,
    className: payload.className,
    parentName: payload.parentName,
    studentName: payload.studentName,
    createdAt: serverTimestamp(),
  });
};

export const recordBulkTags = async (ids = [], tags = []) => {
  const updates = ids.map((id) => saveInquiry(id, { tags }));
  await Promise.all(updates);
};

export const bulkUpdateStatus = async (ids = [], status = 'follow_up') => {
  const updates = ids.map((id) => movePipelineCard(id, status));
  await Promise.all(updates);
};

export const exportInquiries = async (filters = {}) => {
  const data = await fetchInquiries(filters, '');
  return data.map((item) => ({
    id: item.id,
    parentName: item.parentName,
    phone: item.phone,
    classApplied: item.classApplied,
    status: item.status,
    leadSource: item.leadSource,
    budget: item.budget,
  }));
};
