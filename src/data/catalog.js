// Netlify Deal Studio — Product Catalog Data Model (Phase 1)
// Empty catalog. No seed data. No SFDC dependencies.

export const PRODUCT_TYPES = ['bundle', 'platform', 'entitlements', 'addon', 'support'];
export const TYPE_SORT_ORDER = PRODUCT_TYPES.reduce((acc, type, index) => ({ ...acc, [type]: index }), {});
export const TYPE_LABELS = {
  bundle: 'Package',
  platform: 'Platform',
  entitlements: 'Entitlements',
  addon: 'Add-ons',
  support: 'Support',
};
export const PRICE_UNITS = ['flat', 'per_member', 'per_credit', 'per_build'];
export const PRICING_METHODS = ['list', 'cost'];
export const TERM_BEHAVIORS = ['included', 'excluded'];
export const CONFIGURATION_METHODS = ['none', 'bundle'];
export const BUNDLE_PRICING_MODES = ['header_only', 'header_plus_members', 'members_only'];
export const MEMBER_PRICE_BEHAVIORS = ['included', 'discounted', 'related'];

export const TYPE_COLORS = {
  platform: '#5cbbf6',
  entitlements: '#34d399',
  addon: '#a78bfa',
  bundle: '#32e6e2',
  support: '#f472b6',
};

export const TYPE_ICONS = {
  platform: 'fa-bolt',
  entitlements: 'fa-tag',
  addon: 'fa-server',
  bundle: 'fa-boxes-stacked',
  support: 'fa-life-ring',
};

export const getProductCategory = (product) => {
  const raw = product?.category ?? product?.type;
  if (typeof raw !== 'string' || !raw.trim()) return 'platform';
  const cat = raw.trim().toLowerCase();
  if (cat === 'seats' || cat === 'credits') return 'entitlements';
  return cat;
};

export const UNIT_LABELS = {
  flat: 'Flat',
  per_member: '/seat',
  per_credit: '/credit',
  per_build: '/build',
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
  category: 'platform',
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
  unit_of_measure: '',
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
  configuration_method: 'none',
  bundle_pricing: 'header_only',
  print_members: true,
  members: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const emptyBundleMember = (productId = '') => ({
  product_id: productId,
  required: true,
  default_quantity: 1,
  quantity_editable: true,
  sort_order: 1,
  price_behavior: 'related',
  discount_percent: 0,
});

export const isBundleProduct = (product) => product?.configuration_method === 'bundle';

const parseNumber = (value, fallback = 0) => {
  const next = parseFloat(value);
  return Number.isFinite(next) ? next : fallback;
};

const normalizeMemberPrice = (memberPrice, behavior, discountPercent) => {
  if (behavior === 'included') return 0;
  if (behavior === 'discounted') {
    const percent = Math.max(0, Math.min(100, parseNumber(discountPercent)));
    return memberPrice * (1 - percent / 100);
  }
  return memberPrice;
};

export const calcBundleMembersTotal = (bundle, productMap) => {
  if (!Array.isArray(bundle?.members) || !productMap) return 0;
  return bundle.members.reduce((sum, member) => {
    const product = productMap.get(member.product_id);
    if (!product) return sum;
    const quantity = Math.max(0, parseNumber(member.default_quantity, 1));
    const basePrice = Math.max(0, parseNumber(product.default_price?.amount));
    const unitPrice = normalizeMemberPrice(basePrice, member.price_behavior, member.discount_percent);
    return sum + unitPrice * quantity;
  }, 0);
};

export const calcBundleMonthlyTotal = (bundle, productMap) => {
  if (!isBundleProduct(bundle)) return parseNumber(bundle?.default_price?.amount);
  const header = Math.max(0, parseNumber(bundle?.default_price?.amount));
  const members = calcBundleMembersTotal(bundle, productMap);

  if (bundle.bundle_pricing === 'members_only') return members;
  if (bundle.bundle_pricing === 'header_plus_members') return header + members;
  return header;
};

export const fmtPrice = (v) => {
  if (!v || v === 0) return 'Custom';
  return v < 1 ? `$${v.toFixed(2)}` : `$${v.toLocaleString('en-US')}`;
};

export const sortProductsByType = (products = []) =>
  [...products].sort((a, b) => {
    const aCategory = getProductCategory(a);
    const bCategory = getProductCategory(b);
    const typeDiff = (TYPE_SORT_ORDER[aCategory] ?? Number.MAX_SAFE_INTEGER) - (TYPE_SORT_ORDER[bCategory] ?? Number.MAX_SAFE_INTEGER);
    if (typeDiff !== 0) return typeDiff;

    const nameA = (a?.name || '').toLowerCase();
    const nameB = (b?.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
