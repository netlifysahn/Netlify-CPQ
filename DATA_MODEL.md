# Netlify Deal Studio — Data Model (Phase 1)

## Product Schema

```js
Product {
  id: string,              // unique identifier
  name: string,            // display name
  sku: string,             // SKU code (uppercase, Menlo font)
  description: string,     // product description
  active: boolean,         // visible in catalog
  hide: boolean,           // hidden from quote builder

  type: "platform" | "support" | "credits" | "addon",

  is_service: true,        // all products are services

  default_term: number,    // term length in months (default: 12)
  term_unit: "month",      // always months
  term_behavior: "included" | "excluded",

  default_price: {
    amount: number,        // price amount
    unit: "flat" | "per_member" | "per_credit" | "included",
    pricing_method: "list" | "cost"
  },

  unit_of_measure: string, // display label for quantity (e.g. "credits", "members", "instances")

  default_entitlements: json,  // key-value pairs (e.g. {"builds": 1000})

  config: {
    lock_quantity: boolean,
    lock_price: boolean,
    lock_discount: boolean,
    lock_term: boolean,
    default_quantity: number,
    min_quantity: number,
    max_quantity: number,
    edit_name: boolean,
    default_description: string
  },

  configuration_method: "none" | "bundle",      // default: "none"
  bundle_pricing: "header_only" | "header_plus_members" | "members_only",
  print_members: boolean,                        // show members on quote documents
  members: BundleMember[],

  created_at: string,      // ISO timestamp
  updated_at: string       // ISO timestamp
}

BundleMember {
  product_id: string,      // references an existing product
  required: boolean,
  default_quantity: number,
  quantity_editable: boolean,
  sort_order: number,
  price_behavior: "included" | "discounted" | "related",
  discount_percent: number // used when price_behavior = "discounted"
}
```

## Quote Schema

```js
Quote {
  id: string,
  quote_number: string,           // auto-generated "QUO-0001"
  name: string,                   // quote name (required)
  status: "draft" | "submitted" | "won" | "lost" | "cancelled",

  // Customer Information
  customer_name: string,          // company name
  customer_address: string,       // full address (street, city, state, zip, country)
  customer_contact: string,       // legacy contact field

  // Billing Contact
  billing_contact_name: string,
  billing_contact_email: string,
  billing_contact_phone: string,

  // Internal
  prepared_by: string,
  pricebook_id: string | null,

  // Term & Pricing
  term_months: number,            // 12, 24, or 36
  start_date: string,             // ISO date
  end_date: string,               // auto-calculated
  header_discount: number,        // percentage (0-100)

  // Content
  comments: string,
  terms_conditions: string,

  // Children
  line_items: LineItem[],
  groups: Group[],

  created_at: string,
  updated_at: string
}

LineItem {
  id: string,
  product_id: string,
  product_name: string,
  product_sku: string,
  product_type: string,
  group_id: string | null,
  quantity: number,
  list_price: number,
  sales_price: number,
  line_discount: number,
  term_months: number,
  term_behavior: "included" | "excluded",
  config: {
    lock_quantity: boolean,
    lock_price: boolean,
    lock_discount: boolean
  },
  sort_order: number
}

Group {
  id: string,
  name: string,
  description: string,
  sort_order: number
}
```

## Constraints

- No pre-defined products. Empty catalog.
- No SFDC dependencies.
- All products are services (`is_service: true`).
- Types map to semantic colors: platform=blue, support=green, credits=amber, addon=purple.
