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

## Constraints

- No pre-defined products. Empty catalog.
- No SFDC dependencies.
- All products are services (`is_service: true`).
- Types map to semantic colors: platform=blue, support=green, credits=amber, addon=purple.
