# Firebase setup steps for salary and staff portal

Follow these steps to configure Firebase so the new salary and staff portals work correctly.

1. **Verify Authentication users**
   - Create Firebase Auth users for each staff member and accountant.
   - Each user must have a matching document in the `users` collection with the **same auth uid** as the document id and a `role` field set to `staff`, `accountant`, or `parent`.

2. **Seed the `staff` collection**
   - For every staff member, add a document in the `staff` collection using `staffId` as the document id when possible.
   - Required fields include: `staffId`, `authUid`, `fullName`, `designationCategory` (Teacher/Admin/Non Teaching), `subRole`, `employmentType`, `dateOfJoining` (Timestamp), `bankAccountNumber`, `ifscCode`, `panNumber`, `aadhaarNumber`, `salaryCycle`, and `salaryStructureId` (optional reference id).

3. **Create salary structures**
   - Add or update a document in the `salaryStructures` collection for each staff member using the `staffId` as the doc id.
   - Populate salary fields such as `basicPay`, `hra`, `da`, `specialAllowance`, `conveyanceAllowance`, `medicalAllowance`, `otherAllowances` (array), `pfApplicable`, `pfEmployeeContribution`, `pfEmployerContribution`, `esiApplicable`, `professionalTaxApplicable`, `tdsApplicable`, `advanceRecoveryPerMonth`, `otherDeductions` (array), and set `createdAt`/`updatedAt` timestamps.

4. **Track attendance**
   - For every month, add a document in `staffAttendance` with fields: `staffId`, `month` (1-12), `year`, `totalWorkingDays`, `presentDays`, `approvedLeaves`, `unpaidLeaves`, `lateEntries`, and optional `penaltiesAmount`.

5. **Process salaries**
   - Salaries are stored in the `salaries` collection with ids like `<staffId>_<year>_<month>`.
   - Each document should contain snapshots for the month: `staffId`, `staffNameSnapshot`, `designationSnapshot`, `subRole`, `month`, `year`, `allowancesSnapshot`, `deductionsSnapshot`, `attendanceImpactDaysDeducted`, `overtimeHours`, `overtimeAmount`, `extraPayments`, `grossSalary`, `totalDeductions`, `netPayable`, `paymentStatus`, `paymentMethod`, `transactionId`, `penaltiesAmount`, `processedByUid`, and `processedAt` when marked paid.

6. **Storage for slips (optional)**
   - If you want to store PDF slips, create a Firebase Storage bucket path (for example `salary-slips/`) and ensure authenticated users can upload/read their own slips according to your security rules.

7. **Security rules checklist**
   - Ensure Firestore rules allow accountants to read/write the salary-related collections and restrict staff to read-only access for their own salary and attendance documents.
   - Make sure unauthenticated users cannot access any salary data.

8. **Environment variables**
   - Confirm `NEXT_PUBLIC_FIREBASE_*` environment variables are set for the Firebase project in `.env.local` or your hosting provider.

9. **Indexing**
   - Create composite indexes for queries used by the app:
     - `salaries` collection indexed by `staffId` ascending, `year` descending, `month` descending.
     - `staffAttendance` collection indexed by `staffId` ascending, `year` descending, `month` descending.

10. **Testing**
    - Sign in as an accountant, open the Salary tab, and create/update salary structures.
    - Process a salary for a staff member, mark it as paid, and verify it appears in the staff dashboard salary history.
    - Sign in as the corresponding staff user and confirm attendance and salary slips render correctly and are read-only.
