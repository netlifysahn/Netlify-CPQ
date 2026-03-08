// Netlify Deal Studio — Quote Data Model (Phase 3)

import { genId, getProductCategory, UNIT_LABELS } from './catalog';

export const QUOTE_STATUSES = ['draft', 'submitted', 'won', 'lost', 'cancelled'];
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

export const emptyQuote = (existingQuotes = []) => ({
  id: genId(),
  quote_number: genQuoteNumber(existingQuotes),
  name: '',
  customer_name: '',
  customer_contact: '',
  customer_address: '',
  billing_contact_name: '',
  billing_contact_email: '',
  billing_contact_phone: '',
  prepared_by: '',
  pricebook_id: null,
  term_months: 12,
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  header_discount: 0,
  status: 'draft',
  comments: '',
  terms_conditions: '',
  line_items: [],
  groups: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const getUnitType = (product) => product?.default_price?.unit || 'flat';

export const isQuantityEditable = (unitType) => unitType === 'per_member' || unitType === 'per_credit';

export const isIncluded = (unitType) => unitType === 'included';

export const getUnitLabel = (unitType) => UNIT_LABELS[unitType] || unitType || 'Flat';

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
    sort_order: 0,
  };
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
  if (line.net_price != null) {
    return (line.quantity || 1) * line.net_price;
  }
  // Legacy fallback
  let price = line.sales_price || line.list_price || 0;
  if (line.line_discount > 0) {
    price = price * (1 - line.line_discount / 100);
  }
  return (line.quantity || 1) * price;
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
  const lines = quote.line_items || [];
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
  if (v === 0) return '$0';
  if (Math.abs(v) < 1) return `$${v.toFixed(2)}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const STATUS_META = {
  draft: { label: 'Draft', color: 'grey' },
  submitted: { label: 'Submitted', color: 'blue' },
  won: { label: 'Won', color: 'green' },
  lost: { label: 'Lost', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'muted' },
};
