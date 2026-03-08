// Netlify Deal Studio — Quote Data Model (Phase 3)

import { genId } from './catalog';

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

export const emptyLineItem = (product) => ({
  id: genId(),
  product_id: product.id,
  product_name: product.name,
  product_sku: product.sku,
  product_type: product.type,
  group_id: null,
  quantity: product.config?.default_quantity || 1,
  list_price: product.default_price?.amount || 0,
  sales_price: product.default_price?.amount || 0,
  line_discount: 0,
  term_months: product.default_term || 12,
  term_behavior: product.term_behavior || 'included',
  config: {
    lock_quantity: product.config?.lock_quantity || false,
    lock_price: product.config?.lock_price || false,
    lock_discount: product.config?.lock_discount || false,
  },
  sort_order: 0,
});

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

export const calcLineMonthly = (line, headerDiscount = 0) => {
  let price = line.sales_price || 0;
  if (line.line_discount > 0) {
    price = price * (1 - line.line_discount / 100);
  }
  if (headerDiscount > 0) {
    price = price * (1 - headerDiscount / 100);
  }
  return price * (line.quantity || 1);
};

export const calcLineTotal = (line, headerDiscount = 0) => {
  const monthly = calcLineMonthly(line, headerDiscount);
  if (line.term_behavior === 'included') {
    return monthly * (line.term_months || 12);
  }
  return monthly;
};

export const calcQuoteTotals = (quote) => {
  const lines = quote.line_items || [];
  const hd = quote.header_discount || 0;
  const monthly = lines.reduce((s, l) => s + calcLineMonthly(l, hd), 0);
  const annual = monthly * 12;
  const tcv = monthly * (quote.term_months || 12);
  return { monthly, annual, tcv };
};

export const fmtCurrency = (v) => {
  if (v === 0) return '$0';
  if (v < 1) return `$${v.toFixed(2)}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export const STATUS_META = {
  draft: { label: 'Draft', color: 'grey' },
  submitted: { label: 'Submitted', color: 'blue' },
  won: { label: 'Won', color: 'green' },
  lost: { label: 'Lost', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'muted' },
};
