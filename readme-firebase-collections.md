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
