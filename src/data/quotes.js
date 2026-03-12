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
