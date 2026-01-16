# ELNODE School ERP Zero-Trust Setup Guide

This document lists the **required Firebase settings**, **Firestore/Storage rules deployment steps**, and **Vercel (or other hosting) environment variables** needed for the hardened security model.

## 1) Firebase Project Configuration

### Enable Authentication
- Enable **Firebase Authentication** in the Firebase console.
- Ensure clients can obtain **Firebase ID tokens** (used by `/api/createOrder` and `/api/verifyPayment`).

### Custom Claims (RBAC)
All access control is based on **custom claims**:
- `request.auth.token.role`

Supported roles referenced in rules and API:
- `admin`
- `accountant`
- `admission_manager`
- `teacher`
- `parent`

**Set claims using the Admin SDK** (example script):

```js
import admin from 'firebase-admin';

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
});

await admin.auth().setCustomUserClaims('<UID>', { role: 'admin' });
```

> After setting claims, the user must **sign out and sign back in** to refresh their ID token.

### Firestore Rules
Deploy the hardened rules from `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

Key behaviors:
- **No global allow rule**.
- `users/{uid}`: read-only for the owner; no client writes.
- `payments/*` + `students/*`: **client writes denied**; server-side only.
- `inquiries/*` and `visits/*`: only `admission_manager`.
- `salaries/*`: teachers can read only their own salary doc.

### Storage Rules
Deploy the hardened rules from `storage.rules`:

```bash
firebase deploy --only storage
```

Key behaviors:
- `/users/{uid}/**`: only the authenticated owner can read/write.
- `/expenses/**`: only privileged roles can read/write; **only admin can delete**.

## 2) Vercel / Hosting Environment Variables

> These values must be configured in your hosting provider (Vercel, etc.).

### Firebase Admin SDK (Layman Setup)
Used for server-side token verification in API routes.

You will download a **service account JSON** file from Firebase. It contains fields like:

- `type`
- `project_id`
- `private_key_id`
- `private_key`
- `client_email`
- `client_id`
- `auth_uri`
- `token_uri`
- `auth_provider_x509_cert_url`
- `client_x509_cert_url`
- `universe_domain`

**What you do in Vercel (simple steps):**

1. Go to **Firebase Console → Project Settings → Service Accounts**.
2. Click **Generate new private key**.
3. Open the downloaded JSON file.
4. Copy the **entire JSON** (all fields above).
5. In Vercel, add an environment variable:
   - **Name:** `FIREBASE_SERVICE_ACCOUNT_JSON`
   - **Value:** paste the full JSON in one line (Vercel will accept it).

**Alternative (if not using JSON):**
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_EMAIL`
- `FIREBASE_PRIVATE_KEY`
  - Must include newline escapes: `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n`

### Firebase REST (Firestore server writes)
The current payment verification flow uses Firebase's REST API with a service email/password:

- `FIREBASE_API_KEY`
- `FIREBASE_SERVICE_EMAIL`
- `FIREBASE_SERVICE_PASSWORD`

> These should map to a **restricted service account user** (not a normal parent account).

### Razorpay Keys

#### Bhawati (Fees)
- `RAZORPAY_KEY_ID_BHAGWATI`
- `RAZORPAY_KEY_SECRET_BHAGWATI`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID_BHAGWATI`

#### Flykraft (Store)
- `RAZORPAY_KEY_ID_FLYKRAFT`
- `RAZORPAY_KEY_SECRET_FLYKRAFT`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID_FLYKRAFT`

#### Legacy public key (if still used)
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
  - Used by `pages/admission-manager.js` if still configured.

## 3) Client Requirements

- Clients must send an **Authorization Bearer ID token** when calling:
  - `POST /api/createOrder`
  - `POST /api/verifyPayment`

These tokens are required for RBAC enforcement on the server.

## 4) Production Checklist

- [ ] Deploy Firestore rules from `firestore.rules`
- [ ] Deploy Storage rules from `storage.rules`
- [ ] Ensure custom claims are set for every user
- [ ] Set all required env variables in Vercel
- [ ] Verify Razorpay keys in both server and client environments
- [ ] Test payment flow and ensure duplicate `razorpay_payment_id` is rejected
