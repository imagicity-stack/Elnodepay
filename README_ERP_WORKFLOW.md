# ERP Workflow (Detailed)

This document describes how the ERP works based on the current codebase, from sign-in through daily operations. It is written for non-technical stakeholders but stays faithful to how the system behaves.

## 1) Entry point and role-based routing
- Users sign in on the main landing page.
- After authentication, the app looks up the user record in the `users` collection to read the `role` field and redirects accordingly.
- Supported roles include:
  - `super_admin`
  - `admission_manager`
  - `accountant`
  - `staff`
  - `parent`

## 2) Admission pipeline (lead → student)
The admission workflow is the heart of the ERP.

**a) Inquiries**
- Admission managers create and manage leads in the `inquiries` collection.
- Each inquiry can hold follow-ups, notes, and a timeline of events.
- Analytics (new today, pending follow-ups, upcoming visits, conversions) are derived from inquiry data.

**b) Visits**
- Visits are tracked in a separate `visits` collection.
- Scheduling a visit updates the inquiry status and stores a visit reference.

**c) Registrations**
- When a family proceeds, a record is created in `registrations`.
- The related inquiry is updated (for example, to “registered”).

**d) Admissions**
- Registration is then converted into an `admissions` record.
- When admission is completed, a student profile is created in `students`.

**e) Payments at each stage**
- Payment entries are captured in `payments` at registration and admission steps.
- Payments are tied back to inquiries, registrations, or admissions depending on the stage.

## 3) Student lifecycle & parent portal
- Student profiles are stored in `students` and linked to parent users via email or parent UID fields.
- Parents access the **Parent Portal** to:
  - View their children’s profiles and fee status.
  - Review payment history and notifications.
  - Submit support tickets (`support_tickets`).
  - Request fee changes (`fee_requests`).
  - Place store orders (`store_orders`).

## 4) Accounting & finance workflow
The accountant dashboard focuses on money flow and operational costs.

- **Payments & Transactions**
  - All fee and store payments appear in `payments`.
  - A detailed ledger is kept in `transactions_log`.
- **Fee Structures**
  - Fee rules are stored in `settings/feestructure`.
- **Fee Requests**
  - `fee_requests` capture discount/adjustment or special fee workflows.
- **Reminders & Notifications**
  - Reminders are tracked in `reminders`.
  - Parent-facing updates are stored in `notifications`.
- **Expenses**
  - Accounting uploads expense receipts to Storage (see Firebase README).
  - Expense records are tracked in `expenses`.

## 5) Staff & salary workflow
- Staff profiles live in `staff` and link back to user authentication records.
- Salary operations use:
  - `salaries` for payroll runs.
  - `salaryStructures` for per-staff salary templates.
  - `staffAttendance` for attendance data that impacts payroll.
- Admin users can create staff accounts and assign roles.

## 6) Super admin workflow (store + global settings)
The super admin page handles school-wide setup tasks:
- Store categories in `store_categories`.
- Store catalog items in `store_catalog_items`.
- Class-specific items in `store_class_items`.
- Global settings in `settings/super_admin`.

## 7) Supporting settings and counters
- `settings/general` holds shared configuration.
- `settings/admission` stores admission-specific configuration.
- `metadata/school_number_counters` and `counters/inquiry` provide counters for IDs and tracking.

---

If you want any of the sections expanded (for example, specific fee calculations or report layouts), call that out and we can add detail.
