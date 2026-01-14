# Firebase Collections & Documents

This guide lists the Firestore collections/documents required for the new Super Admin student sections.

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

### `store_items` (collection)
Stores catalog items that can be created per class from the Super Admin Store section.

**Path**: `store_items/{autoId}`

**Fields**:
- `className` (string)
- `category` (string)
- `itemName` (string)
- `price` (number)
- `created_at` (timestamp)
- `updated_at` (timestamp)
