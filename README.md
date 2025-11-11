# EL-NODE Pay

A full-stack school fee payment platform for **The Elden Heights School**, combining a Next.js frontend with serverless API routes deployed on Vercel. Parents can review dues and pay instantly via Razorpay, while accountants manage fee ledgers, record manual payments, and send reminders.

## Features

- 🔐 Firebase email/password authentication
- 👨‍👩‍👦 Role-based dashboards for parents and accountants
- 💳 Razorpay Checkout integration with secure signature verification
- 📊 Real-time Firestore updates for dues, collections, and transaction history
- ✉️ Reminder workflow stub using Firebase Cloud Messaging
- 🎨 Tailwind CSS styling with Poppins font and school branding (Cardinal Red #A31F36)

## Project Structure

```
/
├── components/           # Reusable layout and UI primitives
├── lib/firebase.js       # Firebase client initialization
├── pages/
│   ├── _app.js           # Global styles loader
│   ├── index.js          # Login / landing page
│   ├── parent.js         # Parent dashboard
│   ├── accountant.js     # Accountant dashboard
│   └── api/
│       ├── createOrder.js    # Creates Razorpay orders
│       └── verifyPayment.js  # Verifies signatures and updates Firestore
├── styles/globals.css    # Tailwind + global styles
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── next.config.js
├── vercel.json
└── README.md
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file with the following keys (also configure these on Vercel):

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
NEXT_PUBLIC_RAZORPAY_KEY_ID=  # Razorpay public key for the checkout widget
```

Optional, but recommended for accountant stats:

```
FIREBASE_EMULATOR_HOST=
```

> **Note:** Firestore security rules must permit the required read/write operations for authenticated users and API routes. For production, use Firebase Custom Claims or Firestore rules to enforce role-based access.

### 3. Run the development server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the app.

## Firebase Setup Checklist

1. Enable **Email/Password** authentication in Firebase.
2. Create Firestore collections using the following shapes:
   - `users/{userId}` documents containing:
     ```json
     {
       "role": "parent" | "accountant",
       "name": "Parent Name",
       "student_name": "Student Name",
       "class": "Grade 5",
       "contact": "+91-XXXXXXXXXX",
       "total_due": 15000,
       "next_due_date": "2024-06-30",
       "transactions": ["txnRef1"],
       "collected_amount": 5000,
       "student_id": "EH1234"
     }
     ```
   - `transactions/{transactionId}` documents containing:
     ```json
     {
       "user_id": "uid",
       "amount": 5000,
       "date": "2024-05-01T10:30:00.000Z",
       "razorpay_id": "pay_123",
       "status": "success",
       "order_id": "order_123"
     }
     ```
3. (Optional) Set custom claims (`role`) using Firebase Admin SDK to enforce routing logic server-side.

## Razorpay Integration Flow

1. Parent clicks **Pay Now**, triggering `/api/createOrder` to create a Razorpay order.
2. Razorpay Checkout widget handles card/UPI payments.
3. On success, `/api/verifyPayment` validates the signature and updates Firestore balances and transaction history.
4. Accountant dashboard automatically reflects new collections via Firestore real-time listeners.

## Deployment

This repository is configured for Vercel:

- `vercel.json` ensures Next.js is built using the official adapter.
- API routes (`pages/api/*`) run as Vercel serverless functions.
- Set all environment variables in Vercel project settings before deploying.

Deploy using the Vercel dashboard or CLI:

```bash
vercel --prod
```

## License

MIT © The Elden Heights School / Imagicity Technologies
