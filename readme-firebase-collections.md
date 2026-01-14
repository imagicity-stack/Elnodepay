# Firebase Collections & Documents

This guide lists the Firestore collections/documents required for the Super Admin store, parent store orders, and accountant payment collection flows.

## Required collections/documents

### `settings/super_admin` (document)
Stores student-level configuration for the Super Admin portal.

**Path**: `settings/super_admin`

**Fields**:
- `students.coreAcademics` (map)
  - Keys are class names (e.g., `"Nursery"`, `"1"`, `"10"`).
  - Each class map contains:
    - `monthlyFees` (number)
    - `registrationFees` (number)
    - `annualCharges` (number)

### `store_categories` (collection)
Stores the master list of store categories created in the Super Admin Store header.

**Path**: `store_categories/{autoId}`

**Fields**:
- `name` (string)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### `store_catalog_items` (collection)
Stores the master list of items under each category (created in the Super Admin Store header).

**Path**: `store_catalog_items/{autoId}`

**Fields**:
- `categoryId` (string, reference to `store_categories` doc id)
- `categoryName` (string)
- `itemName` (string)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### `store_class_items` (collection)
Stores the class-specific store pricing for items selected from the catalog.

**Path**: `store_class_items/{autoId}`

**Fields**:
- `className` (string)
- `categoryId` (string)
- `categoryName` (string)
- `itemId` (string, reference to `store_catalog_items` doc id)
- `itemName` (string)
- `price` (number)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### `store_orders` (collection)
Stores store orders raised by parents for cash or online checkout.

**Path**: `store_orders/{autoId}`

**Fields**:
- `parent_uid` (string)
- `parent_email` (string)
- `student_doc_id` (string)
- `student_id` (string)
- `student_name` (string)
- `class` (string)
- `items` (array of `{ itemId, itemName, categoryId, categoryName, price }`)
- `amount_total` (number)
- `status` (string, e.g., `Pending`, `Paid`)
- `payment_mode` (string, `Cash` or `Online`)
- `voucher_code` (string, for cash payments)
- `created_at` (timestamp)
- `paid_at` (timestamp)
- `razorpay_order_id` (string, for online payments)
- `razorpay_payment_id` (string, for online payments)

### `fee_requests` (collection)
Stores fee and store payment requests created by the accountant.

**Path**: `fee_requests/{autoId}`

**Fields**:
- `student_doc_id` (string)
- `studentId` (string)
- `student_name` (string)
- `parent_email` (string)
- `amount_total` (number)
- `balance` (number)
- `status` (string, `Pending` or `Paid`)
- `payment_mode` (string)
- `breakdown` (map: `tuition`, `custom`, `store`, `others`)
  - `store.items` (array of `{ itemId, itemName, categoryId, categoryName, price }`)
- `due_date` (timestamp)
- `created_at` (timestamp)
- `paid_at` (timestamp)
- `store_items` (array of `{ itemId, itemName, categoryId, categoryName, price }`)

### `payments` (collection)
Stores payment history across fees and store orders.

**Path**: `payments/{autoId}`

**Fields**:
- `payment_type` (string, `fees` or `store`)
- `store_order_id` (string, set for store payments)
