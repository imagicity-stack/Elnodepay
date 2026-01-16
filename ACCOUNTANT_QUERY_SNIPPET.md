# Accountant Query Snippet (Security Rules Alignment)

If you want to ensure payment reads only return records the current user is allowed to access, you can scope the payments query by `parent_uid` for parent-facing views. This is not required for accountant/admin roles (they are allowed broad access), but it avoids permission errors when a non-admin role hits the same logic.

```js
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const currentUser = auth.currentUser;
const paymentsQuery = query(
  collection(db, 'payments'),
  where('parent_uid', '==', currentUser.uid),
  orderBy('date', 'desc'),
  limit(250),
);
```

If you are running this in an accountant-only screen, you can keep the unrestricted query (accountants are allowed read/write for `payments`).
