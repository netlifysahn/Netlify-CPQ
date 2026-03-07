// Netlify Deal Studio — Product Catalog Data Model (Phase 1)
// Empty catalog. No seed data. No SFDC dependencies.

export const PRODUCT_TYPES = ['platform', 'support', 'credits', 'addon'];
export const PRICE_UNITS = ['flat', 'per_member', 'per_credit', 'per_gb', 'included'];
export const PRICING_METHODS = ['list', 'cost'];
export const TERM_BEHAVIORS = ['included', 'excluded'];

export const TYPE_COLORS = {
  platform: '#5cbbf6',
  support: '#34d399',
  credits: '#f5a623',
  addon: '#a78bfa',
};

export const TYPE_ICONS = {
  platform: 'fa-bolt',
  support: 'fa-headset',
  credits: 'fa-coins',
  addon: 'fa-server',
};

export const UNIT_LABELS = {
  flat: 'Flat',
  per_member: '/member',
  per_credit: '/credit',
  per_gb: '/GB',
  included: 'Included',
};

let _counter = 0;
export const genId = () => 'id_' + Date.now().toString(36) + '_' + (++_counter).toString(36);

export const emptyProduct = () => ({
  id: genId(),
  name: '',
  sku: '',
  description: '',
  active: true,
  hide: false,
  type: 'platform',
  is_service: true,
  default_term: 12,
  term_unit: 'month',
  term_behavior: 'included',
  default_price: {
    amount: 0,
    unit: 'flat',
    pricing_method: 'list',
  },
  default_entitlements: '{}',
  config: {
    lock_quantity: false,
    lock_price: false,
    lock_discount: false,
    lock_term: false,
    default_quantity: 1,
    min_quantity: 1,
    max_quantity: 999,
    edit_name: false,
    default_description: '',
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const fmtPrice = (v) => {
  if (!v || v === 0) return 'Custom';
  return v < 1 ? `$${v.toFixed(2)}` : `$${v.toLocaleString('en-US')}`;
};
