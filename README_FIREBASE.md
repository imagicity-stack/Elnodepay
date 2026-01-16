# Firebase Connection (Layman-Friendly)

This project uses Firebase for three things:
1. **Authentication** (who can log in)
2. **Firestore** (the main database)
3. **Storage** (file uploads)

Below is a simple breakdown of how each piece is connected and what data is stored.

---

## 1) How the app connects to Firebase
### Client-side (browser) connection
The app initializes Firebase in the browser with environment variables:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

These values are used to create the Firebase app, then the app exports:
- `auth` (Authentication)
- `db` (Firestore)
- `storage` (Storage)

### Server-side (API routes) connection
The Next.js API routes use Firebase Admin to verify login tokens and to access Firestore securely.
Admin credentials are pulled from:
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Some payment APIs also use the Firebase Identity Toolkit + Firestore REST APIs with:
- `FIREBASE_API_KEY`
- `FIREBASE_SERVICE_EMAIL`
- `FIREBASE_SERVICE_PASSWORD`

---

## 2) Authentication (who can log in)
The system uses Firebase Authentication for login and user management.

### How roles work
- After a user logs in, their role is read from Firestore (`users` collection).
- Roles determine which dashboard is shown: `super_admin`, `admission_manager`, `accountant`, `staff`, or `parent`.
- Some API routes enforce roles server-side by checking the Firebase ID token.

### How accounts are created
- Admin and staff workflows create new accounts with `createUserWithEmailAndPassword`.
- Common use cases include creating staff, parent, or student accounts.

### Common auth flows used
- Sign in with email/password.
- Sign out.
- Persistent login (“remember me”).
- Password reset (parent portal).

---

## 3) Firestore collections (what data is stored)
Here is a plain-English view of the collections used in the code:

### Core records
- `users`: user profiles, role assignments, and links to auth UIDs.
- `students`: student profiles and parent linkage fields.
- `staff`: staff profiles and role metadata.

### Admissions funnel
- `inquiries`: prospective student leads.
- `visits`: campus visits scheduled from an inquiry.
- `registrations`: registration step after a lead is qualified.
- `admissions`: the final admission record before a student is created.
- `payments`: any payment events (registration, admission, fees, store orders).

### Finance
- `fee_requests`: special fee requests or adjustments.
- `transactions_log`: detailed payment ledger entries.
- `expenses`: expenses logged by accounting.
- `reminders`: scheduled reminders.

### Notifications & support
- `notifications`: parent-facing alerts and announcements.
- `support_tickets`: parent help requests.

### Store / catalog
- `store_categories`: store category definitions.
- `store_catalog_items`: product catalog items.
- `store_class_items`: class-specific items.
- `store_orders`: store orders from parents.
- `store_charges`: charges related to store orders.

### HR / payroll
- `staffAttendance`: attendance records for staff.
- `salaryStructures`: per-staff salary templates.
- `salaries`: payroll runs and payouts.

### Settings & counters (documents)
- `settings/general`: general system configuration.
- `settings/feestructure`: fee rules and templates.
- `settings/super_admin`: store/system configuration managed by super admin.
- `settings/admission`: admission-specific settings.
- `metadata/school_number_counters`: counters used for school numbers.
- `counters/inquiry`: inquiry counter used for IDs.

### Subcollections
- `inquiries/{inquiryId}/timeline`: timeline events related to an inquiry.

---

## 4) Firestore security rules (who can read/write)
**Current Firestore rules** are role-based:
- `users/{userId}`: only the owner can read; no writes.
- `payments`: read only for `admin`, `accountant`, `admission_manager`.
- `students`: readable by admins/admissions/teachers, or by the parent that matches the student’s `parent_uid` or `parentUid`.
- `inquiries` and `visits`: full read/write for `admission_manager` only.
- `staff`: read for `admin` or `admission_manager`.
- `salaries`: read for `admin`, or teacher reading their own salary.
- Everything else is denied by default.

---

## 5) Storage (file uploads)
Storage is used mainly for file uploads like expense receipts or user files.

### Storage paths used in the code
- `expenses/{expenseId}/{fileName}` for expense attachments.
- `inquiries/{inquiryId}/{fileName}` for inquiry documents.
- `users/{userId}/...` (general user file storage).

### Storage security rules (current)
- `expenses/**`: read/write for `admin`, `accountant`, `admission_manager`; delete only for `admin`.
- `users/{userId}/**`: read/write only by that user.
- Everything else is blocked.

**Note:** The current rules do *not* explicitly allow the `inquiries/**` upload path. If inquiry uploads are required, the storage rules may need to be expanded to allow `admission_manager` to write to that path.

---

If you want a deeper breakdown of any collection’s fields or example documents, I can add that next.
