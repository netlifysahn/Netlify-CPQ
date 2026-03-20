import { fmtCurrency, getEffectiveLineQuantity } from '../data/quotes';
import { isRichTextEmpty, toRichTextHtml } from './richText';

// ── UTILS ─────────────────────────────────────────────────────────────────────
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtQty(n) {
  return n == null ? '' : Number(n).toLocaleString('en-US');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasLineDiscount(lines) {
  return lines.some(l => l.list_price != null && l.net_price != null && l.net_price < l.list_price);
}

const EXHIBIT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function toExhibitLabel(index) {
  let n = index, s = '';
  while (n >= 0) { s = EXHIBIT_CHARS[n % 26] + s; n = Math.floor(n / 26) - 1; }
  return `Exhibit ${s}`;
}

function collectLineTermExhibits(lines = []) {
  const exhibitEntries = [], exhibitByLineId = new Map(), exhibitByLineRef = new Map();
  lines.forEach((line) => {
    const termsHtml = toRichTextHtml(line?.terms || '');
    if (isRichTextEmpty(termsHtml)) return;
    const exhibitLabel = toExhibitLabel(exhibitEntries.length);
    const entry = { line, exhibitLabel, productName: line?.product_name || 'Product', termsHtml };
    exhibitEntries.push(entry);
    if (line?.id) exhibitByLineId.set(line.id, exhibitLabel);
    exhibitByLineRef.set(line, exhibitLabel);
  });
  return { exhibitEntries, exhibitByLineId, exhibitByLineRef };
}

// ── HTML BUILDER ──────────────────────────────────────────────────────────────
function buildQuoteHTML(quote, settings, logoB64) {
  const allLines = quote.line_items || [];
  const { exhibitEntries, exhibitByLineId, exhibitByLineRef } = collectLineTermExhibits(allLines);

  const getLineExhibit = (line) => {
    if (!line) return '';
    return (line.id && exhibitByLineId.get(line.id)) || exhibitByLineRef.get(line) || '';
  };
  const getLineLabel = (line, fallback = line?.product_name || 'Product') => {
    const ex = getLineExhibit(line);
    return ex ? `${esc(fallback)} <span class="exhibit-ref">(${esc(ex)})</span>` : esc(fallback);
  };

  // ── LOGO ────────────────────────────────────────────────────────────────────
  const logoHtml = logoB64
    ? `<img src="data:image/png;base64,${logoB64}" class="logo" alt="Netlify" />`
    : `<span class="logo-text">netlify</span>`;

  const partnerHtml = quote.partner_name
    ? `<span class="partner">× ${esc(quote.partner_name)}</span>`
    : '';

  // ── HEADER META ─────────────────────────────────────────────────────────────
  const metaRight = [
    quote.prepared_by     && `<div class="meta-item"><span class="meta-label">Prepared by</span><span class="meta-value">${esc(quote.prepared_by)}</span></div>`,
    quote.start_date      && `<div class="meta-item"><span class="meta-label">Quote Date</span><span class="meta-value">${fmtDate(quote.start_date)}</span></div>`,
    quote.expiration_date && `<div class="meta-item"><span class="meta-label">Expires</span><span class="meta-value">${fmtDate(quote.expiration_date)}</span></div>`,
  ].filter(Boolean).join('');

  // ── BILLING METADATA ────────────────────────────────────────────────────────
  const billToLines = [quote.contact_name, quote.contact_email].filter(Boolean);
  const billingLines = [
    quote.billing_contact_name,
    quote.billing_contact_email,
    quote.billing_contact_phone,
    quote.invoice_email ? `Invoice: ${quote.invoice_email}` : null,
  ].filter(Boolean);
  const termLines = [
    quote.payment_terms    ? `Payment: ${quote.payment_terms}` : null,
    quote.billing_schedule ? `Billing: ${quote.billing_schedule}` : null,
    quote.payment_method   ? `Method: ${quote.payment_method}` : null,
    quote.start_date       ? `Start: ${fmtDate(quote.start_date)}` : null,
    quote.term_months      ? `Term: ${quote.term_months} Months` : null,
    quote.account_id       ? `Account: ${quote.account_id}` : null,
  ].filter(Boolean);

  const renderMetaCol = (label, lines) => {
    if (!lines.length) return '';
    return `
      <div class="meta-col">
        <div class="col-label">${esc(label)}</div>
        ${lines.map(l => `<div class="col-value">${esc(l)}</div>`).join('')}
      </div>`;
  };

  // ── BASE PACKAGE ────────────────────────────────────────────────────────────
  const packageLines = allLines.filter(l => l.is_package);
  const basePackageHtml = packageLines.map(pkg => {
    const subs = allLines.filter(l => l.parent_line_id === pkg.id);
    const monthly = pkg.net_price ?? pkg.list_price ?? 0;
    const annual = monthly * 12;
    return `
      <div class="pkg-row">
        <div class="pkg-name">${getLineLabel(pkg)}</div>
        <div class="pkg-prices">
          <div class="price-group">
            <div class="price-label">Monthly</div>
            <div class="price-value">${fmtCurrency(monthly)}</div>
          </div>
          <div class="price-group">
            <div class="price-label">Annual</div>
            <div class="price-value">${fmtCurrency(annual)}</div>
          </div>
        </div>
      </div>
      <div class="pkg-included">
        <div class="included-label">Included</div>
        <div class="included-items">
          ${subs.map(s => {
            const qty = getEffectiveLineQuantity(s);
            const qtyStr = qty > 1 ? `<span class="qty">${fmtQty(qty)}</span>` : '';
            return `<div class="included-item">${getLineLabel(s)}${qtyStr}</div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  // ── LINE SECTION RENDERER ───────────────────────────────────────────────────
  const renderSection = (label, lines) => {
    if (!lines.length) return '';
    const showDisc = hasLineDiscount(lines);
    const isEnt = !['Support', 'Platform Add-Ons'].includes(label);

    let headCols, rows;

    if (!isEnt) {
      headCols = showDisc
        ? ['', 'List Price', 'Disc. Monthly', 'Disc. Annual']
        : ['', 'Monthly', 'Annual'];
      rows = lines.map(l => {
        const list = l.list_price ?? 0;
        const net = l.net_price ?? list;
        const cells = showDisc
          ? [getLineLabel(l), fmtCurrency(list), fmtCurrency(net), fmtCurrency(net * 12)]
          : [getLineLabel(l), fmtCurrency(net), fmtCurrency(net * 12)];
        return { cells, features: Array.isArray(l.features) ? l.features : [] };
      });
    } else {
      headCols = showDisc
        ? ['', 'Qty', 'List', 'Unit Price', 'Annual']
        : ['', 'Qty', 'Unit Price', 'Annual'];
      rows = lines.map(l => {
        const qty = getEffectiveLineQuantity(l);
        const list = l.list_price ?? 0;
        const net = l.net_price ?? list;
        const isCred = l.product_type === 'credits' && l.unit_type === 'per_credit';
        const annual = isCred ? net * qty : net * qty * 12;
        const cells = showDisc
          ? [getLineLabel(l), fmtQty(qty), fmtCurrency(list), fmtCurrency(net), fmtCurrency(annual)]
          : [getLineLabel(l), fmtQty(qty), fmtCurrency(net), fmtCurrency(annual)];
        return { cells, features: Array.isArray(l.features) ? l.features : [] };
      });
    }

    const colCount = headCols.length;
    const firstColClass = 'col-name';
    const numColClass = 'col-num';

    return `
      <div class="section">
        <div class="section-eyebrow">${esc(label)}</div>
        <table class="line-table">
          <thead>
            <tr>
              ${headCols.map((h, i) => `<th class="${i === 0 ? firstColClass : numColClass}">${esc(h)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr class="line-row">
                ${row.cells.map((c, i) => `<td class="${i === 0 ? firstColClass : numColClass}">${i === 0 ? c : esc(c)}</td>`).join('')}
              </tr>
              ${row.features.map(f => `
                <tr class="feature-row">
                  <td class="feature-cell" colspan="${colCount}">${esc(f)}</td>
                </tr>`).join('')}
            `).join('')}
          </tbody>
        </table>
      </div>`;
  };

  // ── OVERAGE RATES ───────────────────────────────────────────────────────────
  const overageRows = [];
  const seen = new Set();
  allLines.filter(l => ['seats', 'credits', 'entitlements'].includes(l.product_type)).forEach(l => {
    const key = l.product_type === 'seats' ? 'Enterprise Seats'
      : l.product_type === 'credits' ? 'Credits'
      : l.product_name;
    if (seen.has(key)) return;
    seen.add(key);
    let overage = '—';
    if (l.product_type === 'seats'   && quote.overage_rate_seats)   overage = quote.overage_rate_seats;
    if (l.product_type === 'credits' && quote.overage_rate_credits) overage = quote.overage_rate_credits;
    overageRows.push([key, fmtQty(l.quantity), overage]);
  });

  const overageHtml = overageRows.length ? `
    <div class="section">
      <div class="section-eyebrow">Consumption Limits &amp; Overage Rates</div>
      <table class="line-table">
        <thead>
          <tr>
            <th class="col-name"></th>
            <th class="col-num">Included</th>
            <th class="col-num">Overage Rate</th>
          </tr>
        </thead>
        <tbody>
          ${overageRows.map(([name, qty, rate]) => `
            <tr class="line-row">
              <td class="col-name">${esc(name)}</td>
              <td class="col-num">${esc(qty)}</td>
              <td class="col-num">${esc(rate)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  // ── ORDER FORM HEADER TEXT ──────────────────────────────────────────────────
  const ofHtml = toRichTextHtml(settings?.orderFormHeaderText || '');
  const orderFormText = !isRichTextEmpty(ofHtml)
    ? `<div class="order-form-text">${ofHtml}</div>`
    : '';

  // ── TOTALS ──────────────────────────────────────────────────────────────────
  const priceable = allLines.filter(l => l.parent_line_id ? l.price_behavior === 'related' : true);
  const listTotal = priceable.reduce((s, l) => {
    const qty = getEffectiveLineQuantity(l), list = l.list_price ?? 0;
    const isCred = l.product_type === 'credits' && l.unit_type === 'per_credit';
    return s + (isCred ? list * qty : list * qty * 12);
  }, 0);
  const netTotal = priceable.reduce((s, l) => {
    const qty = getEffectiveLineQuantity(l), net = l.net_price ?? l.list_price ?? 0;
    const isCred = l.product_type === 'credits' && l.unit_type === 'per_credit';
    return s + (isCred ? net * qty : net * qty * 12);
  }, 0);
  const headerDiscPct = quote.header_discount || 0;
  const headerDiscAmt = netTotal * (headerDiscPct / 100);
  const finalACV = netTotal - headerDiscAmt;
  const lineDiscAmt = listTotal - netTotal;
  const totalDisc = lineDiscAmt + headerDiscAmt;
  const hasDiscount = totalDisc > 0.01;

  const totalsRows = hasDiscount ? `
    <tr class="total-row">
      <td class="total-label">Total Annual List Price</td>
      <td class="total-value">${fmtCurrency(listTotal)}</td>
    </tr>
    <tr class="total-row discount-row">
      <td class="total-label">${headerDiscPct > 0 && lineDiscAmt > 0.01
        ? 'Discount'
        : headerDiscPct > 0
          ? `Discount (${headerDiscPct}%)`
          : 'Discount'}</td>
      <td class="total-value">–${fmtCurrency(totalDisc)}</td>
    </tr>` : '';

  const totalsHtml = `
    <div class="totals-block">
      <table class="totals-table">
        <tbody>
          ${totalsRows}
          <tr class="total-row acv-row">
            <td class="total-label">Net Annual Fees</td>
            <td class="total-value acv-value">${fmtCurrency(finalACV)}</td>
          </tr>
        </tbody>
      </table>
      <div class="monthly-equiv">${fmtCurrency(finalACV / 12)} / month</div>
      ${(quote.term_months || 12) > 12 ? `<div class="term-badge">${quote.term_months}-Month Term</div>` : ''}
    </div>`;

  // ── TERMS ───────────────────────────────────────────────────────────────────
  const termsSections = settings?.terms?.sections || [];
  const hasSettingsTerms = termsSections.some(s => Boolean(s?.title?.trim()) || !isRichTextEmpty(toRichTextHtml(s?.body || '')));
  const hasTerms = hasSettingsTerms || exhibitEntries.length > 0 || quote.terms_conditions?.trim();

  const termsHtml = hasTerms ? `
    <div class="page-break"></div>
    <div class="terms-section">
      <h2 class="terms-title">Terms &amp; Conditions</h2>
      ${termsSections.map(section => {
        const title = section?.title?.trim() || '';
        const bodyHtml = toRichTextHtml(section?.body || '');
        const hasBody = !isRichTextEmpty(bodyHtml);
        if (!title && !hasBody) return '';
        return `
          ${title ? `<h3 class="terms-heading">${esc(title)}</h3>` : ''}
          ${hasBody ? `<div class="terms-body">${bodyHtml}</div>` : ''}`;
      }).join('')}
      ${quote.terms_conditions?.trim() ? `
        <h3 class="terms-heading">Additional Terms</h3>
        <div class="terms-body">${toRichTextHtml(quote.terms_conditions.trim())}</div>` : ''}
      ${exhibitEntries.map(entry => `
        <h3 class="terms-heading exhibit-heading">${esc(entry.exhibitLabel)} — ${esc(entry.productName)}</h3>
        <div class="terms-body">${entry.termsHtml}</div>`).join('')}
      ${quote.quote_type === 'order_form' ? `
        <div class="signature-block">
          <h2 class="sig-title">Signature</h2>
          <p class="sig-note">Your signature of this Order Form constitutes your agreement and consent to all terms referenced in this Order Form.</p>
          <div class="sig-cols">
            <div class="sig-col">
              <div class="sig-party">Customer</div>
              <div class="sig-field"><span class="sig-label">Signature</span><span class="sig-line"></span></div>
              <div class="sig-field"><span class="sig-label">Print Name</span><span class="sig-line"></span></div>
              <div class="sig-field"><span class="sig-label">Title</span><span class="sig-line"></span></div>
              <div class="sig-field"><span class="sig-label">Date</span><span class="sig-line"></span></div>
            </div>
            <div class="sig-col">
              <div class="sig-party">Netlify, Inc.</div>
              <div class="sig-field"><span class="sig-label">Signature</span><span class="sig-line"></span></div>
              <div class="sig-field"><span class="sig-label">Print Name</span><span class="sig-line"></span></div>
              <div class="sig-field"><span class="sig-label">Title</span><span class="sig-line"></span></div>
              <div class="sig-field"><span class="sig-label">Date</span><span class="sig-line"></span></div>
            </div>
          </div>
        </div>` : ''}
    </div>` : '';

  const draftBanner = (quote.status === 'draft' || quote.status === 'draft_revision')
    ? `<div class="draft-watermark">DRAFT</div>` : '';

  // ── STANDALONES ─────────────────────────────────────────────────────────────
  const standaloneSupport = allLines.filter(l => !l.parent_line_id && !l.is_package && l.product_type === 'support');
  const standaloneAddons  = allLines.filter(l => !l.parent_line_id && !l.is_package && l.product_type === 'addon');
  const standaloneEnt     = allLines.filter(l => !l.parent_line_id && !l.is_package && ['entitlements', 'seats', 'credits'].includes(l.product_type));

  // ── FULL HTML ───────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(quote.quote_number || 'Quote')} — ${esc(quote.customer_name || '')}</title>
<style>
  /* ── RESET & BASE ──────────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  
  html { font-size: 10pt; }
  
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a1a;
    background: #fff;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── PRINT BUTTON ──────────────────────────────────────────── */
  .print-bar {
    position: fixed;
    top: 0; left: 0; right: 0;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
    padding: 12px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 100;
    gap: 12px;
  }
  .print-bar-left {
    font-size: 8.5pt;
    color: #9ca3af;
  }
  .btn-print {
    background: #00ad9f;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 8px 20px;
    font-size: 9pt;
    font-weight: 500;
    cursor: pointer;
    letter-spacing: 0.01em;
  }
  .btn-print:hover { background: #009e91; }

  /* ── PAGE LAYOUT ───────────────────────────────────────────── */
  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: 80px 48px 60px;
  }

  @media print {
    .print-bar { display: none !important; }
    .page { padding: 0; max-width: 100%; }
    body { font-size: 9.5pt; }
    .page-break { page-break-before: always; }
  }

  /* ── DRAFT WATERMARK ───────────────────────────────────────── */
  .draft-watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 120pt;
    font-weight: 700;
    color: rgba(0,0,0,0.04);
    pointer-events: none;
    z-index: 0;
    letter-spacing: 0.1em;
  }

  /* ── HEADER ────────────────────────────────────────────────── */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 28px;
  }
  .logo-wrap { display: flex; align-items: center; gap: 10px; }
  .logo { height: 22px; width: auto; }
  .logo-text { font-size: 16pt; font-weight: 700; color: #1a1a1a; }
  .partner { font-size: 8.5pt; color: #9ca3af; }
  .quote-number { font-size: 8pt; color: #9ca3af; letter-spacing: 0.04em; }

  .header-rule { border: none; border-top: 1.5px solid #1a1a1a; margin-bottom: 24px; }

  /* ── CUSTOMER + META ───────────────────────────────────────── */
  .customer-block {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }
  .customer-name {
    font-size: 20pt;
    font-weight: 700;
    color: #0f1114;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .customer-address {
    font-size: 9pt;
    color: #9ca3af;
    margin-top: 4px;
  }
  .meta-right { text-align: right; }
  .meta-item {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-bottom: 6px;
  }
  .meta-label { font-size: 6.5pt; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; }
  .meta-value { font-size: 9pt; color: #1e2024; font-weight: 400; }

  .billing-rule { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  .billing-rule-heavy { border-top-width: 1.5px; border-top-color: #1a1a1a; }

  /* ── BILLING METADATA 3-COL ────────────────────────────────── */
  .billing-meta {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin-bottom: 28px;
  }
  .meta-col {}
  .col-label {
    font-size: 6.5pt;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 5px;
  }
  .col-value {
    font-size: 9pt;
    color: #32343a;
    line-height: 1.6;
  }

  /* ── SECTIONS ──────────────────────────────────────────────── */
  .section { margin-bottom: 28px; }

  .section-eyebrow {
    font-size: 6.5pt;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }

  /* ── BASE PACKAGE ──────────────────────────────────────────── */
  .base-package { margin-bottom: 28px; }
  .base-eyebrow {
    font-size: 6.5pt;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .base-eyebrow-cols { display: flex; gap: 32px; }
  .pkg-rule { border: none; border-top: 1px solid #e5e7eb; margin-bottom: 14px; }

  .pkg-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 10px;
  }
  .pkg-name {
    font-size: 13pt;
    font-weight: 700;
    color: #0f1114;
    letter-spacing: -0.01em;
  }
  .pkg-prices { display: flex; gap: 32px; }
  .price-group { text-align: right; }
  .price-label { font-size: 6.5pt; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; }
  .price-value { font-size: 11pt; color: #1e2024; font-weight: 500; }

  .pkg-included { margin-bottom: 8px; }
  .included-label {
    font-size: 6.5pt;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
  }
  .included-item {
    font-size: 9.5pt;
    color: #32343a;
    padding: 3px 0 3px 12px;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .included-item .qty { color: #9ca3af; }
  .exhibit-ref { color: #9ca3af; font-size: 0.88em; }

  /* ── LINE TABLES ───────────────────────────────────────────── */
  .line-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  .line-table thead tr {
    border-bottom: 1px solid #e5e7eb;
  }
  .line-table th {
    font-size: 6.5pt;
    font-weight: 400;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0 6px 8px;
  }
  .line-table th.col-name { text-align: left; padding-left: 0; }
  .line-table th.col-num  { text-align: right; }

  .line-row td {
    padding: 9px 6px;
    color: #32343a;
    border-top: 1px solid #f3f4f6;
  }
  .line-row:first-child td { border-top: none; }
  .col-name { text-align: left; padding-left: 0 !important; }
  .col-num  { text-align: right; white-space: nowrap; }

  .feature-row td {
    font-size: 8pt;
    color: #9ca3af;
    padding: 1px 6px 1px 20px;
    border-top: none;
  }

  /* ── TOTALS ────────────────────────────────────────────────── */
  .totals-block {
    margin-top: 8px;
    margin-left: auto;
    width: 320px;
  }
  .totals-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .total-row td { padding: 5px 0; }
  .total-label { font-size: 8pt; color: #6b7280; }
  .total-value { font-size: 9pt; color: #32343a; text-align: right; }
  .discount-row .total-label,
  .discount-row .total-value { color: #6b7280; }

  .acv-row { border-top: 1px solid #e5e7eb; }
  .acv-row td { padding-top: 10px; }
  .acv-row .total-label { font-size: 7pt; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; }
  .acv-value { font-size: 22pt !important; font-weight: 700; color: #0f1114 !important; letter-spacing: -0.02em; }

  .monthly-equiv { font-size: 8pt; color: #9ca3af; text-align: right; margin-top: 2px; }
  .term-badge { font-size: 7pt; color: #fbb13d; text-align: right; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; }

  .disclaimer {
    font-size: 7pt;
    color: #d1d5db;
    margin-top: 20px;
    line-height: 1.5;
  }

  /* ── TERMS ─────────────────────────────────────────────────── */
  .terms-section { margin-top: 8px; }
  .terms-title {
    font-size: 16pt;
    font-weight: 700;
    color: #0f1114;
    margin-bottom: 8px;
    letter-spacing: -0.02em;
  }
  .terms-rule { border: none; border-top: 1.5px solid #1a1a1a; margin-bottom: 24px; }
  .terms-heading {
    font-size: 10pt;
    font-weight: 600;
    color: #1a1a1a;
    margin-top: 20px;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid #f3f4f6;
  }
  .exhibit-heading { margin-top: 32px; }
  .terms-body {
    font-size: 9pt;
    color: #32343a;
    line-height: 1.65;
  }
  .terms-body p { margin-bottom: 8px; }
  .terms-body ol, .terms-body ul { padding-left: 20px; margin-bottom: 8px; }
  .terms-body li { margin-bottom: 3px; }

  /* ── SIGNATURE ─────────────────────────────────────────────── */
  .signature-block { margin-top: 40px; }
  .sig-title {
    font-size: 14pt;
    font-weight: 700;
    color: #0f1114;
    margin-bottom: 6px;
    letter-spacing: -0.01em;
  }
  .sig-note { font-size: 8.5pt; color: #6b7280; margin-bottom: 24px; line-height: 1.5; }
  .sig-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sig-party { font-size: 11pt; font-weight: 600; color: #0f1114; margin-bottom: 20px; }
  .sig-field {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    margin-bottom: 20px;
  }
  .sig-label { font-size: 8pt; color: #6b7280; white-space: nowrap; min-width: 70px; }
  .sig-line { flex: 1; border-bottom: 1px solid #d1d5db; height: 18px; }

  /* ── FOOTER (print only) ───────────────────────────────────── */
  @media print {
    @page { margin: 18mm 18mm 14mm; size: A4; }
    .footer-bar {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      display: flex;
      justify-content: space-between;
      font-size: 7pt;
      color: #d1d5db;
      border-top: 1px solid #e5e7eb;
      padding-top: 5px;
    }
  }
  .footer-bar { display: none; }
  @media print { .footer-bar { display: flex; } }
</style>
</head>
<body>

<div class="print-bar">
  <span class="print-bar-left">Confidential – Do Not Distribute</span>
  <button class="btn-print" onclick="window.print()">Save as PDF</button>
</div>

${draftBanner}

<div class="page">

  <!-- HEADER -->
  <div class="doc-header">
    <div class="logo-wrap">
      ${logoHtml}
      ${partnerHtml}
    </div>
    <div class="quote-number">${esc((quote.quote_number || '').replace('QUO-', 'QUOTE · '))}</div>
  </div>
  <hr class="header-rule">

  <!-- CUSTOMER -->
  <div class="customer-block">
    <div>
      <div class="customer-name">${esc(quote.customer_name || '')}</div>
      ${quote.address ? `<div class="customer-address">${esc(quote.address)}</div>` : ''}
    </div>
    <div class="meta-right">${metaRight}</div>
  </div>

  <hr class="billing-rule">

  <!-- BILLING METADATA -->
  <div class="billing-meta">
    ${renderMetaCol('Bill To', billToLines)}
    ${renderMetaCol('Billing Contact', billingLines)}
    ${renderMetaCol('Contract Terms', termLines)}
  </div>

  <hr class="billing-rule billing-rule-heavy">

  <!-- BASE PACKAGE -->
  ${packageLines.length ? `
  <div class="base-package">
    <div class="base-eyebrow">
      <span>Base Package</span>
      <div class="base-eyebrow-cols">
        <span>Monthly</span>
        <span>Annual</span>
      </div>
    </div>
    <hr class="pkg-rule">
    ${basePackageHtml}
  </div>` : ''}

  <!-- LINE SECTIONS -->
  ${renderSection('Support', standaloneSupport)}
  ${renderSection('Platform Add-Ons', standaloneAddons)}
  ${renderSection('Additional Entitlements', standaloneEnt)}
  ${overageHtml}

  <!-- ORDER FORM TEXT -->
  ${orderFormText}

  <!-- TOTALS -->
  <hr class="billing-rule billing-rule-heavy">
  ${totalsHtml}

  <p class="disclaimer">All prices are quoted in USD and are exclusive of any applicable taxes, commissions, import duties, or other similar fees.</p>

  <!-- TERMS -->
  ${termsHtml}

</div>

<div class="footer-bar">
  <span>Confidential – Do Not Distribute</span>
  <span>${esc(quote.quote_number || '')}</span>
</div>

</body>
</html>`;
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export async function generateQuotePDF(quote, products, settings, { preview = false } = {}) {
  const { NETLIFY_LOGO_B64 } = await import('../assets/netlifyLogo.js').catch(() => ({ NETLIFY_LOGO_B64: null }));
  const html = buildQuoteHTML(quote, settings, NETLIFY_LOGO_B64);

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('beforeunload', () => URL.revokeObjectURL(url), { once: true });
  } else {
    // popup blocked — fallback: create a link and click it
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quote.quote_number || 'quote'}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
