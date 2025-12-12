# Firebase updates for super admin rollout

1. **Create the `super_admin` user role** in Firestore under `users/{uid}` by setting `role: "super_admin"`. This is required for login redirection to `/super_admin`.
2. **Seed the fee settings document**: create or update `settings/super_admin` with a `students` map shaped as:
   ```json
   {
     "CLASS": {
       "monthlyFees": 0,
       "kitCharges": 0,
       "storeCharges": 0,
       "annualCharges": 0,
       "admissionCharges": 0,
       "registrationFees": 0
     }
   }
   ```
   Replace `CLASS` with each class key (e.g., `"1"`, `"UKG"`).
3. **Optional: enable staff provisioning** by allowing the `super_admin` portal to create authentication users when adding staff. Ensure the Firebase Authentication email templates are configured and the `users` collection allows writes from privileged users.
