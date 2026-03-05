// ─── Product Catalog Seed Data ────────────────────────────────
// This is the source of truth for the initial product catalog.
// Agent Runners and manual edits can extend this file.

export const CATEGORIES = ['Platform', 'Bandwidth', 'Add-ons', 'Support', 'Security'];
export const PRICING_MODELS = ['Flat Rate', 'Per Unit', 'Tiered'];

let _counter = 0;
export const genId = () => 'id_' + Date.now().toString(36) + '_' + (++_counter).toString(36);

export const SEED_PRODUCTS = [
  {
    id: genId(),
    name: 'Netlify Pro',
    sku: 'NTL-PRO',
    category: 'Platform',
    pricingModel: 'Flat Rate',
    price: 19,
    unit: '/member/mo',
    active: true,
    notes: '',
  },
  {
    id: genId(),
    name: 'Netlify Enterprise',
    sku: 'NTL-ENT',
    category: 'Platform',
    pricingModel: 'Flat Rate',
    price: 0,
    unit: 'custom',
    active: true,
    notes: 'Custom pricing — Deal Desk',
  },
  {
    id: genId(),
    name: 'Simple Bandwidth',
    sku: 'NTL-BW-SMP',
    category: 'Bandwidth',
    pricingModel: 'Tiered',
    price: 0.20,
    unit: '/GB',
    active: true,
    notes: 'Tier 1: $0.20 | Tier 2: $0.12 | Tier 3: $0.06',
  },
  {
    id: genId(),
    name: 'Unified Credits',
    sku: 'NTL-CRD-UNI',
    category: 'Platform',
    pricingModel: 'Per Unit',
    price: 500,
    unit: '/10K block',
    active: true,
    notes: '',
  },
  {
    id: genId(),
    name: 'Enterprise Support',
    sku: 'NTL-SUP-ENT',
    category: 'Support',
    pricingModel: 'Flat Rate',
    price: 3000,
    unit: '/mo',
    active: true,
    notes: '',
  },
  {
    id: genId(),
    name: 'High-Performance Edge',
    sku: 'NTL-EDGE-HP',
    category: 'Add-ons',
    pricingModel: 'Flat Rate',
    price: 1500,
    unit: '/mo',
    active: true,
    notes: '',
  },
  {
    id: genId(),
    name: 'Private Connectivity',
    sku: 'NTL-PRIV-CON',
    category: 'Add-ons',
    pricingModel: 'Flat Rate',
    price: 2500,
    unit: '/mo',
    active: true,
    notes: 'Dedicated private network peering',
  },
  {
    id: genId(),
    name: 'HIPAA Compliance Pack',
    sku: 'NTL-SEC-HIPAA',
    category: 'Security',
    pricingModel: 'Flat Rate',
    price: 5000,
    unit: '/yr',
    active: false,
    notes: '',
  },
];
