# Firestore and Firebase Auth setup for staff payroll

Use this checklist to keep the staff salary and authentication flows working:

1. **Authentication defaults**
   - Create staff accounts in Firebase Authentication with the email/password method (password suggestion: `elnstaff123`).
   - Every staff auth user must have a matching document in `users/<authUid>` with fields: `email`, `name`, `role: 'staff'`, `staffId`, and `category`.

2. **Staff collection**
   - Store staff profiles in `staff/<staffId>` with `staffId`, `fullName`, `designationCategory` (`Admin`/`Teacher`/`Non Teaching`), `subRole` or `subject`, `employmentType`, `phoneNumber`, `address`, and `authUid` (if available).
   - Staff IDs follow the `EHS-<prefix><3 digits>` pattern used by the app: `AD` for Admin, `TE` for Teacher, `NT` for Non Teaching.

3. **Salary structures and runs**
   - Salary structures live in `salaryStructures/<staffId>` and should include the allowance/deduction fields shown in the salary settings UI.
   - Processed salaries are stored in `salaries/<staffId>_<year>_<month>` with snapshots for allowances, deductions, and payment status.

4. **Attendance**
   - Save monthly attendance in `staffAttendance` with `staffId`, `month`, `year`, and day counts for working, present, approved leave, and unpaid leave.

5. **Rules and indexes**
   - Firestore rules should allow accountants to manage all salary collections and restrict staff to read-only access for their own `staff`, `salaries`, and `staffAttendance` documents.
   - Add indexes for queries on `salaries` (`staffId`, `year`, `month`) and `staffAttendance` (`staffId`, `year`, `month`).

6. **Testing**
   - Sign in as an accountant, open **Salary → Staff Settings**, create a staff member, and confirm the `users` and `staff` documents appear in Firestore.
   - Process a salary for that staff ID and verify it shows up in the staff portal salary history after signing in with the generated credentials.
