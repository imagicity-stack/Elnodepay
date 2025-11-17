# Firestore Security Rules

The deployed `firestore.rules` file currently grants both read and write access to *any* authenticated user across the entire database:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }
    match /{document=**} {
      allow read, write: if signedIn();
    }
  }
}
```

Because every collection inherits that blanket rule (via the `/{document=**}` match), you **do not** need to duplicate the same `isSignedIn()` condition for each collection such as `users`, `students`, `payments`, etc. Subcollections and nested documents are automatically covered as well.

## When should I update the rules?

You only need to modify the rules if you want to restrict access further than "any logged-in user can read and write everything." For example:

- **Per-user restrictions:** require `request.auth.uid == userId` inside `/users/{userId}` so parents can only read their own document.
- **Read-only collections:** expose announcements with `allow read: if true;` while keeping write access locked down to privileged service accounts.
- **Role-based controls:** reference a custom claim (e.g., `request.auth.token.role == 'admin'`) before allowing writes to financial collections such as `payments` or `transactions_log`.

Until you add those constraints, the current ruleset already resolves the `permission-denied` error from the parent dashboard because any authenticated session now satisfies `signedIn()`.

## Deployment reminder

After editing `firestore.rules`, redeploy them so Firebase uses the new policy:

```
firebase deploy --only firestore:rules
```

Skipping that step leaves the previous rules active in production even if you changed the local file.
