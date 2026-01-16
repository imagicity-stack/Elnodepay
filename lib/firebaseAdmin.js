import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const loadServiceAccount = () => {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch (error) {
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON payload.');
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_SERVICE_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
};

const getAdminApp = () => {
  if (getApps().length) {
    return getApps()[0];
  }

  const serviceAccount = loadServiceAccount();
  if (serviceAccount) {
    return initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.projectId });
  }

  return initializeApp();
};

export const adminAuth = () => getAuth(getAdminApp());
