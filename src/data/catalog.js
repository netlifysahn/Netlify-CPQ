// Netlify Deal Studio — Product Catalog Data Model (Phase 1)
// Empty catalog. No seed data. No SFDC dependencies.

export const PRODUCT_TYPES = ['bundle', 'platform', 'entitlements', 'addon', 'support'];
export const TYPE_SORT_ORDER = PRODUCT_TYPES.reduce((acc, type, index) => ({ ...acc, [type]: index }), {});
export const TYPE_LABELS = {
  bundle: 'Base Package',
  platform: 'Platform',
  entitlements: 'Entitlements',
  addon: 'Platform Add-Ons',
  support: 'Support',
};
export const PRICE_UNITS = ['flat', 'per_member', 'per_credit', 'per_build'];
export const PRICING_METHODS = ['list', 'cost'];
export const TERM_BEHAVIORS = ['included', 'excluded'];
export const CONFIGURATION_METHODS = ['none', 'bundle'];
export const BUNDLE_PRICING_MODES = ['header_only', 'header_plus_members', 'members_only'];
export const MEMBER_PRICE_BEHAVIORS = ['included', 'discounted', 'related'];
export const PACKAGE_SECTIONS = ['platform', 'support', 'entitlement'];
export const PACKAGE_QTY_BEHAVIORS = ['hidden', 'fixed', 'editable'];
export const PACKAGE_PRICING_DISPLAYS = ['hidden', 'package_only', 'row_level'];
export const PACKAGE_QUOTE_EDIT_MODES = ['read_only', 'editable_qty', 'editable_price', 'editable_qty_and_price'];

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
  package_components: [],
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

const normalizeSection = (value) => {
  if (value === 'platform' || value === 'support' || value === 'entitlement') return value;
  if (value === 'entitlements') return 'entitlement';
  return null;
};

const inferSectionFromProduct = (productOrCategory) => {
  const category = typeof productOrCategory === 'string'
    ? productOrCategory
    : getProductCategory(productOrCategory);
  if (category === 'support') return 'support';
  if (category === 'entitlements') return 'entitlement';
  return 'platform';
};

const defaultComponentConfigBySection = {
  platform: {
    default_qty: null,
    min_qty: null,
    max_qty: null,
    qty_behavior: 'hidden',
    pricing_display: 'package_only',
    quote_edit_mode: 'read_only',
  },
  support: {
    default_qty: 1,
    min_qty: 1,
    max_qty: 1,
    qty_behavior: 'hidden',
    pricing_display: 'package_only',
    quote_edit_mode: 'read_only',
  },
  entitlement: {
    default_qty: 1,
    min_qty: 1,
    max_qty: null,
    qty_behavior: 'editable',
    pricing_display: 'package_only',
    quote_edit_mode: 'editable_qty',
  },
};

const parseNullableNumber = (value, fallback = null) => {
  if (value === '' || value == null) return fallback;
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

export const normalizePackageComponent = (component, referencedProduct, index = 0, packageId = '') => {
  const inferredSection = inferSectionFromProduct(referencedProduct || component);
  const section = normalizeSection(component?.section) || inferredSection;
  const defaults = defaultComponentConfigBySection[section];
  const defaultQty = parseNullableNumber(
    component?.default_qty ?? component?.default_quantity ?? component?.qty,
    defaults.default_qty,
  );
  const minQty = parseNullableNumber(component?.min_qty, defaults.min_qty);
  const maxQty = parseNullableNumber(component?.max_qty, defaults.max_qty);
  const qtyBehavior = PACKAGE_QTY_BEHAVIORS.includes(component?.qty_behavior)
    ? component.qty_behavior
    : defaults.qty_behavior;
  const pricingDisplay = PACKAGE_PRICING_DISPLAYS.includes(component?.pricing_display)
    ? component.pricing_display
    : (component?.price_behavior === 'related' ? 'row_level' : defaults.pricing_display);
  const quoteEditMode = PACKAGE_QUOTE_EDIT_MODES.includes(component?.quote_edit_mode)
    ? component.quote_edit_mode
    : defaults.quote_edit_mode;
  const sortOrder = parseNullableNumber(component?.sort_order, index + 1) ?? (index + 1);
  const componentProductId = component?.component_product_id || component?.product_id || '';
  const isIncluded = typeof component?.is_included === 'boolean' ? component.is_included : true;
  return {
    id: component?.id || genId(),
    package_product_id: component?.package_product_id || packageId || '',
    component_product_id: componentProductId,
    section,
    is_included: isIncluded,
    sort_order: Math.max(1, Math.trunc(sortOrder)),
    default_qty: defaultQty,
    min_qty: minQty,
    max_qty: maxQty,
    qty_behavior: qtyBehavior,
    pricing_display: pricingDisplay,
    quote_edit_mode: quoteEditMode,
    is_required: typeof component?.is_required === 'boolean' ? component.is_required : Boolean(component?.required),
    is_default_selected: typeof component?.is_default_selected === 'boolean' ? component.is_default_selected : true,
    notes: component?.notes ?? null,
  };
};

export const getProductPackageComponents = (product, productMap = null) => {
  const source = Array.isArray(product?.package_components) && product.package_components.length > 0
    ? product.package_components
    : Array.isArray(product?.members) && product.members.length > 0
      ? product.members
      : Array.isArray(product?.components)
        ? product.components
        : [];
  return source
    .map((component, index) => {
      const productId = component?.component_product_id || component?.product_id;
      const ref = productId && productMap ? productMap.get(productId) : null;
      const normalized = normalizePackageComponent(component, ref, index, product?.id);
      if (!normalized.component_product_id) return null;
      return normalized;
    })
    .filter(Boolean)
    .sort((a, b) => a.sort_order - b.sort_order);
};

export const packageComponentToLegacyMember = (component, referencedProduct, index = 0) => {
  const qty = Math.max(1, parseNullableNumber(component?.default_qty, 1) || 1);
  const listPrice = parseNumber(referencedProduct?.default_price?.amount ?? 0, 0);
  const pricingDisplay = component?.pricing_display || 'package_only';
  return {
    product_id: component.component_product_id,
    name: referencedProduct?.name || '',
    sku: referencedProduct?.sku || '',
    qty,
    default_quantity: qty,
    unit_type: referencedProduct?.default_price?.unit || 'flat',
    price_behavior: pricingDisplay === 'row_level' ? 'related' : 'included',
    list_price: listPrice,
    sort_order: component?.sort_order || index + 1,
    section: component?.section || inferSectionFromProduct(referencedProduct),
  };
};

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
