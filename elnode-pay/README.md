# EL-NODE Pay — School Fee Payment Platform

EL-NODE Pay is a full-stack fee management solution for The Elden Heights School. The project couples a React Native (Expo) mobile experience with a secure Node.js + Express backend that integrates Firebase and Razorpay for authentication, data storage, and payment processing.

## Project Structure

```
elnode-pay/
├── frontend/        # React Native + Expo app
├── backend/         # Node.js + Express API
├── README.md        # You are here
└── .gitignore
```

## Frontend (React Native + Expo)

### Prerequisites
- Node.js 18+
- Expo CLI (`npm install -g expo-cli`) or use `npx expo`

### Setup & Scripts

```bash
cd frontend
npm install
npm run start        # starts Expo development server
npm run android      # build & run on Android (requires Android tooling)
npm run ios          # build & run on iOS (requires macOS + Xcode)
npm run web          # run the app in a web browser
```

### Key Features
- **Splash Screen** featuring The Elden Heights School branding and tagline
- **Role selection** (Parent / Accountant)
- **Dual authentication** flows using Firebase Authentication:
  - Parents authenticate with **phone number + OTP**
  - Accountants authenticate with **email + password**
- **Parent dashboard** presenting outstanding dues, next due date, payment history, and a Pay Now CTA
- **Accountant dashboard** to search students, add dues, send reminders, and mark payments
- Cardinal Red (`#A31F36`) and white theme with Poppins typography

### Firebase Integration
1. Create a Firebase project and enable **Authentication** (Phone + Email/Password) and **Cloud Firestore**.
2. Copy the Firebase web configuration to `frontend/firebaseConfig.js`.
3. For phone auth on mobile, configure the **Recaptcha** settings as per [Expo + Firebase Phone Auth documentation](https://docs.expo.dev/versions/latest/sdk/firebase-recaptcha/).
4. Suggested Firestore schema:

```
users (collection)
  user_id: <auto>
  role: "parent" | "accountant"
  name: string
  student_name: string
  class: string
  contact: string
  total_due: number
  next_due_date: string
  transactions: string[]

transactions (collection)
  txn_id: <auto>
  user_id: string
  amount: number
  date: ISO string
  razorpay_id: string
  status: "created" | "paid"
  razorpay_payment_id?: string
  razorpay_signature?: string
```

## Backend (Node.js + Express)

### Prerequisites
- Node.js 18+
- Razorpay test account credentials
- Firebase service account credentials for server-side Firestore access

### Setup & Scripts

```bash
cd backend
cp .env.example .env
# Fill in Razorpay + Firebase credentials in .env
npm install
npm run start        # or: node index.js
```

The API listens on **port 5000** by default (configurable via `PORT`).

### Environment Variables (`backend/.env`)

| Variable | Description |
| --- | --- |
| `RAZORPAY_KEY_ID` | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account client email |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key (escape newlines with `\\n`) |
| `PORT` | Optional port override (defaults to 5000) |

### API Overview

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Health check |
| `POST` | `/createOrder` | Creates a Razorpay order (expects `{ amount, currency?, receipt?, notes?, userId? }`) |
| `POST` | `/verifyPayment` | Verifies Razorpay signature and marks the transaction as paid |

The backend creates and updates Firestore transaction documents when orders are created and verified. After a successful verification, the user’s outstanding balance is reduced atomically.

## Razorpay Integration Workflow
1. Frontend requests order creation from `/createOrder` with amount and user context.
2. Backend responds with a `orderId` which the frontend uses to launch the Razorpay checkout (`razorpay-react-native`).
3. On success, frontend sends `orderId`, `paymentId`, and `signature` to `/verifyPayment`.
4. Backend validates the signature, updates Firestore transaction status to **paid**, and adjusts the user’s total due.

## Hosting & Deployment

### Backend — Render.com
1. Push this repository to GitHub.
2. Create a new **Web Service** on Render and connect the repository.
3. Set the build command to `npm install` and the start command to `npm run start` inside the `backend` directory (using Render’s root directory override).
4. Add environment variables in Render’s dashboard (`RAZORPAY_*`, `FIREBASE_*`, `PORT`).

### Frontend — Expo
1. Use Expo Go for rapid previews (`expo start`), or
2. Build for stores using Expo Application Services (EAS) and publish to Google Play / Apple App Store as needed.

### Firebase
- Firebase provides authentication, Firestore database, and can be extended for Cloud Messaging notifications.
- Consider enabling Cloud Functions to trigger reminders or automate reconciliation.

## Development Tips
- Keep service account credentials secure. Never commit actual `.env` files.
- Use Firebase Security Rules to protect Firestore collections.
- For Razorpay webhooks, consider adding a `/webhook` endpoint to capture asynchronous payment events.

## License
This project is scaffolded for The Elden Heights School. Adapt as needed for production deployments.
