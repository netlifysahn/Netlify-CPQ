// Netlify Deal Studio — Quote Data Model (Phase 3)

import { genId, getProductCategory, UNIT_LABELS, isBundleProduct } from './catalog';

export const QUOTE_STATUSES = ['draft', 'sent', 'draft_revision', 'ready_to_submit', 'pending_approval', 'approved', 'rejected', 'converted', 'archived'];
export const TERM_OPTIONS = [12, 24, 36];

let _quoteCounter = 0;
export const genQuoteNumber = (existing = []) => {
  const max = existing.reduce((m, q) => {
    const n = parseInt((q.quote_number || '').replace('QUO-', ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  _quoteCounter = Math.max(_quoteCounter, max);
  return `QUO-${String(++_quoteCounter).padStart(4, '0')}`;
};

export const BILLING_SCHEDULES = ['Annual', 'Quarterly', 'Monthly'];
export const PAYMENT_METHODS = ['ACH', 'Wire', 'Credit Card', 'Check'];
export const PAYMENT_TERMS = ['Net 30', 'Net 45', 'Net 60'];

export const emptyQuote = (existingQuotes = []) => ({
  id: genId(),
  quote_number: genQuoteNumber(existingQuotes),
  name: '',
  quote_date: new Date().toISOString().split('T')[0],
  customer_name: '',
  contact_name: '',
  contact_email: '',
  address: '',
  customer_contact: '',
  customer_address: '',
  billing_contact_name: '',
  billing_contact_email: '',
  billing_contact_phone: '',
  invoice_email: '',
  account_id: '',
  prepared_by: '',
  pricebook_id: null,
  term_months: 12,
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  expiration_date: '',
  effective_date: '',
  billing_schedule: 'Annual',
  payment_method: '',
  payment_terms: 'Net 30',
  po_number: '',
  vat_number: '',
  header_discount: 0,
  status: 'draft',
  quote_type: 'net_new',
  partner_name: '',
  comments: '',
  terms_conditions: '',
  line_items: [],
  groups: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const getUnitType = (product) => product?.default_price?.unit || 'flat';

export const isQuantityEditable = (unitType) => unitType === 'per_member' || unitType === 'per_credit' || unitType === 'per_build';

export const isIncluded = (unitType) => unitType === 'included';

export const getUnitLabel = (unitType) => UNIT_LABELS[unitType] || unitType || 'Flat';

export const getEffectiveLineQuantity = (line) => {
  if (!line) return 1;
  if (line.product_type === 'support') return 1;
  const qty = Number(line.quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
};

export const emptyLineItem = (product, listPrice) => {
  const unitType = getUnitType(product);
  const price = listPrice ?? product.default_price?.amount ?? 0;
  const qty = isIncluded(unitType) ? 1 : (isQuantityEditable(unitType) ? (product.config?.default_quantity || 1) : 1);
  return {
    id: genId(),
    product_id: product.id,
    product_name: product.name,
    product_sku: product.sku,
    product_type: getProductCategory(product),
    unit_type: unitType,
    group_id: null,
    quantity: qty,
    list_price: isIncluded(unitType) ? 0 : price,
    discount_percent: 0,
    discount_amount: 0,
    net_price: isIncluded(unitType) ? 0 : price,
    name_editable: !!product.config?.edit_name,
    terms: product.terms || '',
    sort_order: 0,
  };
};

// Package parent line uses package-level pricing as the source of truth.
export const emptyPackageLine = (product) => {
  const price = product?.default_price?.amount ?? 0;
  return ({
  id: genId(),
  product_id: product.id,
  product_name: product.name,
  product_sku: product.sku,
  product_type: getProductCategory(product),
  unit_type: 'flat',
  group_id: null,
  is_package: true,
  name_editable: !!product.config?.edit_name,
  terms: product.terms || '',
  quantity: 0,
  list_price: price,
  discount_percent: 0,
  discount_amount: 0,
  net_price: price,
  sort_order: 0,
  });
};

// Sub-line item for a bundle member (supports both old and new member schemas)
export const emptySubLineItem = (memberProduct, member, parentLineId, listPrice) => {
  const unitType = member.unit_type || getUnitType(memberProduct);
  const price = listPrice ?? member.list_price ?? memberProduct.default_price?.amount ?? 0;
  const qty = getProductCategory(memberProduct) === 'support' ? 1 : (member.qty || member.default_quantity || 1);
  const included = member.price_behavior === 'included';
  const discPct = member.price_behavior === 'discounted' ? (member.discount_percent || 0) : 0;
  const effectivePrice = included ? 0 : price;
  const synced = included ? { discount_percent: 0, discount_amount: 0, net_price: 0 }
    : discPct > 0 ? syncDiscountFromPercentRaw(effectivePrice, discPct)
    : { discount_percent: 0, discount_amount: 0, net_price: effectivePrice };

  return {
    id: genId(),
    product_id: memberProduct.id,
    product_name: memberProduct.name,
    product_sku: memberProduct.sku,
    product_type: getProductCategory(memberProduct),
    unit_type: unitType,
    group_id: null,
    parent_line_id: parentLineId,
    price_behavior: member.price_behavior || 'included',
    name_editable: !!memberProduct.config?.edit_name,
    terms: memberProduct.terms || '',
    quantity: qty,
    list_price: effectivePrice,
    ...synced,
    sort_order: member.sort_order || 0,
  };
};

// Internal sync that doesn't depend on round2 being defined later
const syncDiscountFromPercentRaw = (listPrice, percent) => {
  const p = Math.max(0, Math.min(100, percent || 0));
  const amount = listPrice * (p / 100);
  const net = listPrice - amount;
  return { discount_percent: p, discount_amount: Math.round(amount * 100) / 100, net_price: Math.round(Math.max(0, net) * 100) / 100 };
};

export const emptyGroup = () => ({
  id: genId(),
  name: '',
  description: '',
  sort_order: 0,
});

export const calcEndDate = (startDate, termMonths) => {
  if (!startDate) return '';
  const d = new Date(startDate + 'T00:00:00');
  d.setMonth(d.getMonth() + termMonths);
  return d.toISOString().split('T')[0];
};

// Sync discount fields: when % changes, compute $; when $ changes, compute %
export const syncDiscountFromPercent = (listPrice, percent) => {
  const p = Math.max(0, Math.min(100, percent || 0));
  const amount = listPrice * (p / 100);
  const net = listPrice - amount;
  return { discount_percent: p, discount_amount: round2(amount), net_price: round2(Math.max(0, net)) };
};

export const syncDiscountFromAmount = (listPrice, amount) => {
  const a = Math.max(0, Math.min(listPrice, amount || 0));
  const percent = listPrice > 0 ? (a / listPrice) * 100 : 0;
  const net = listPrice - a;
  return { discount_percent: round2(percent), discount_amount: round2(a), net_price: round2(Math.max(0, net)) };
};

const round2 = (v) => Math.round(v * 100) / 100;

// Line extended total = qty x net price
// Backward compat: old lines may have sales_price/line_discount instead of net_price
export const calcLineExtended = (line) => {
  const quantity = getEffectiveLineQuantity(line);
  if (line.net_price != null) {
    return quantity * line.net_price;
  }
  // Legacy fallback
  let price = line.sales_price || line.list_price || 0;
  if (line.line_discount > 0) {
    price = price * (1 - line.line_discount / 100);
  }
  return quantity * price;
};

// Line monthly after quote-level discount
export const calcLineMonthly = (line, headerDiscount = 0) => {
  let extended = calcLineExtended(line);
  if (headerDiscount > 0) {
    extended = extended * (1 - headerDiscount / 100);
  }
  return extended;
};

export const calcLineTotal = (line, headerDiscount = 0) => {
  return calcLineMonthly(line, headerDiscount);
};

export const calcQuoteTotals = (quote) => {
  const allLines = quote.line_items || [];
  // Priceable lines:
  //   - Package headers (is_package: true) → priced at their header list_price
  //   - Standalone lines (no parent_line_id, not a package)
  //   - "related" sub-components (parent_line_id set, price_behavior = "related")
  // Excluded:
  //   - "included" sub-components (parent_line_id set, price_behavior != "related")
  const lines = allLines.filter((l) => {
    if (l.parent_line_id) return l.price_behavior === 'related';
    return true; // package headers + standalone lines
  });
  const hd = quote.header_discount || 0;
  const term = quote.term_months || 12;

  // Pre-discount (before quote-level discount)
  const preDiscountMonthly = lines.reduce((s, l) => s + calcLineExtended(l), 0);
  const preDiscountAnnual = preDiscountMonthly * 12;
  const preDiscountTcv = preDiscountMonthly * term;

  // Post-discount (after quote-level discount)
  const monthly = lines.reduce((s, l) => s + calcLineMonthly(l, hd), 0);
  const annual = monthly * 12;
  const tcv = monthly * term;

  return {
    monthly, annual, tcv,
    preDiscountMonthly, preDiscountAnnual, preDiscountTcv,
    hasQuoteDiscount: hd > 0,
  };
};

export const fmtCurrency = (v) => {
  const n = typeof v === 'number' && !isNaN(v) ? v : 0;
  if (n === 0) return '$0';
  if (Math.abs(n) < 1) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const STATUS_META = {
  draft: { label: 'Draft', color: 'grey' },
  sent: { label: 'Sent', color: 'blue' },
  draft_revision: { label: 'Draft — Revision', color: 'gold' },
  ready_to_submit: { label: 'Ready to Submit', color: 'teal' },
  pending_approval: { label: 'Pending Approval', color: 'purple' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  converted: { label: 'Converted', color: 'darkgreen' },
  archived: { label: 'Archived', color: 'muted' },
};
