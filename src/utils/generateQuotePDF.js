import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtCurrency, getEffectiveLineQuantity } from '../data/quotes';
import { isRichTextEmpty, renderRichText, toRichTextHtml } from './richText';

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const F       = 'helvetica';
const C_BLACK = [15,  17,  20];
const C_INK   = [30,  32,  36];
const C_BODY  = [50,  52,  58];
const C_MUTED = [130, 133, 140];
const C_GHOST = [185, 188, 194];
const C_RULE  = [224, 226, 230];
const C_GOLD  = [251, 177,  61];

const PW     = 210;
const PH     = 297;
const ML     = 20;
const MR     = 20;
const CW     = PW - ML - MR;
const FOOT_H = 14;

const EXHIBIT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── UTILS ─────────────────────────────────────────────────────────────────────
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtQty(n) {
  return n == null ? '' : Number(n).toLocaleString('en-US');
}

function checkPage(doc, y, needed = 28) {
  if (y + needed > PH - FOOT_H - 6) { doc.addPage(); return ML; }
  return y;
}

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

function hasLineDiscount(lines) {
  return lines.some(l => l.list_price != null && l.net_price != null && l.net_price < l.list_price);
}

// ── DRAWING PRIMITIVES ────────────────────────────────────────────────────────
function rule(doc, y, { x = ML, w = CW, color = C_RULE, weight = 0.2 } = {}) {
  doc.setDrawColor(...color);
  doc.setLineWidth(weight);
  doc.line(x, y, x + w, y);
}

function set(doc, { font = F, style = 'normal', size = 9, color = C_BODY } = {}) {
  doc.setFont(font, style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

function txt(doc, text, x, y, opts = {}) {
  doc.text(String(text), x, y, opts);
}

function microLabel(doc, text, x, y) {
  set(doc, { size: 6.5, color: C_MUTED });
  txt(doc, text.toUpperCase(), x, y);
  return y + 3.8;
}

// ── FOOTER ────────────────────────────────────────────────────────────────────
function addFooters(doc, quoteNumber) {
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    rule(doc, PH - FOOT_H);
    set(doc, { size: 7, color: C_GHOST });
    txt(doc, 'Confidential – Do Not Distribute', ML, PH - FOOT_H + 5);
    txt(doc, quoteNumber || '', PW / 2, PH - FOOT_H + 5, { align: 'center' });
    txt(doc, `${i} / ${n}`, PW - MR, PH - FOOT_H + 5, { align: 'right' });
  }
}

// ── SECTION EYEBROW ───────────────────────────────────────────────────────────
function sectionEyebrow(doc, label, y, extraRight = []) {
  y = checkPage(doc, y, 14);
  set(doc, { size: 7, color: C_MUTED });
  txt(doc, label.toUpperCase(), ML, y);
  extraRight.forEach(([text, offset]) => {
    txt(doc, text, PW - MR - offset, y, { align: 'right' });
  });
  y += 3.5;
  rule(doc, y);
  return y + 6;
}

// ── LINE SECTION TABLE ────────────────────────────────────────────────────────
function renderLineSection(doc, label, lines, getLineLabel, y) {
  if (!lines.length) return y;
  const showDisc = hasLineDiscount(lines);

  let head, colStyles;
  let bodyRows = [], meta = [];

  const addRows = (l, rowFn, colCount) => {
    bodyRows.push(rowFn(l));
    meta.push({ isFeature: false });
    (Array.isArray(l.features) ? l.features : []).forEach(f => {
      bodyRows.push([f, ...Array(colCount - 1).fill('')]);
      meta.push({ isFeature: true });
    });
  };

  const isEntitlements = !['Support', 'Platform Add-Ons'].includes(label);

  if (!isEntitlements) {
    if (showDisc) {
      head = [['', 'List Price', 'Disc. Monthly', 'Disc. Annual']];
      colStyles = { 0:{cellWidth:'auto'}, 1:{halign:'right',cellWidth:32}, 2:{halign:'right',cellWidth:36}, 3:{halign:'right',cellWidth:36} };
      lines.forEach(l => addRows(l, (l) => {
        const list = l.list_price ?? 0, net = l.net_price ?? list;
        return [getLineLabel(l), fmtCurrency(list), fmtCurrency(net), fmtCurrency(net * 12)];
      }, 4));
    } else {
      head = [['', 'Monthly', 'Annual']];
      colStyles = { 0:{cellWidth:'auto'}, 1:{halign:'right',cellWidth:40}, 2:{halign:'right',cellWidth:40} };
      lines.forEach(l => addRows(l, (l) => {
        const net = l.net_price ?? l.list_price ?? 0;
        return [getLineLabel(l), fmtCurrency(net), fmtCurrency(net * 12)];
      }, 3));
    }
  } else {
    if (showDisc) {
      head = [['', 'Qty', 'List', 'Unit Price', 'Annual']];
      colStyles = { 0:{cellWidth:'auto'}, 1:{halign:'right',cellWidth:20}, 2:{halign:'right',cellWidth:28}, 3:{halign:'right',cellWidth:28}, 4:{halign:'right',cellWidth:34} };
      lines.forEach(l => addRows(l, (l) => {
        const qty = getEffectiveLineQuantity(l), list = l.list_price ?? 0, net = l.net_price ?? list;
        const isCred = l.product_type === 'credits' && l.unit_type === 'per_credit';
        return [getLineLabel(l), fmtQty(qty), fmtCurrency(list), fmtCurrency(net), fmtCurrency(isCred ? net*qty : net*qty*12)];
      }, 5));
    } else {
      head = [['', 'Qty', 'Unit Price', 'Annual']];
      colStyles = { 0:{cellWidth:'auto'}, 1:{halign:'right',cellWidth:22}, 2:{halign:'right',cellWidth:32}, 3:{halign:'right',cellWidth:36} };
      lines.forEach(l => addRows(l, (l) => {
        const qty = getEffectiveLineQuantity(l), net = l.net_price ?? l.list_price ?? 0;
        const isCred = l.product_type === 'credits' && l.unit_type === 'per_credit';
        return [getLineLabel(l), fmtQty(qty), fmtCurrency(net), fmtCurrency(isCred ? net*qty : net*qty*12)];
      }, 4));
    }
  }

  y = sectionEyebrow(doc, label, y);

  autoTable(doc, {
    startY: y - 3,
    head,
    body: bodyRows,
    margin: { left: ML, right: MR },
    theme: 'plain',
    styles: { font: F, fontSize: 9.5, cellPadding: { top: 3.5, bottom: 3.5, left: 2, right: 2 }, textColor: C_BODY, lineWidth: 0 },
    headStyles: { font: F, fontStyle: 'normal', fontSize: 7, textColor: C_MUTED, cellPadding: { top: 1, bottom: 3, left: 2, right: 2 } },
    columnStyles: colStyles,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const m = meta[data.row.index];
      if (!m) return;
      if (m.isFeature) {
        data.cell.styles.fontSize = 8;
        data.cell.styles.textColor = C_MUTED;
        data.cell.styles.cellPadding = { top: 0.5, bottom: 0.5, left: 14, right: 2 };
      }
      if (!m.isFeature && data.row.index > 0 && !meta[data.row.index - 1]?.isFeature) {
        data.cell.styles.lineWidth = { top: 0.15 };
        data.cell.styles.lineColor = C_RULE;
      }
    },
  });

  return doc.lastAutoTable.finalY + 10;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export async function generateQuotePDF(quote, products, settings, { preview = false } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const allLines = quote.line_items || [];
  const { exhibitEntries, exhibitByLineId, exhibitByLineRef } = collectLineTermExhibits(allLines);

  const getLineExhibit = (line) => {
    if (!line) return '';
    return (line.id && exhibitByLineId.get(line.id)) || exhibitByLineRef.get(line) || '';
  };
  const getLineLabel = (line, fallback = line?.product_name || 'Product') => {
    const ex = getLineExhibit(line);
    return ex ? `${fallback} (${ex})` : fallback;
  };

  let y = ML;

  // ── DRAFT WATERMARK ────────────────────────────────────────────────────────
  if (quote.status === 'draft' || quote.status === 'draft_revision') {
    doc.saveGraphicsState();
    set(doc, { style: 'bold', size: 80, color: [244, 244, 244] });
    const wt = 'DRAFT';
    txt(doc, wt, (PW - doc.getTextWidth(wt)) / 2, 150);
    doc.restoreGraphicsState();
  }

  // ── LOGO + QUOTE NUMBER ────────────────────────────────────────────────────
  const { NETLIFY_LOGO_B64 } = await import('../assets/netlifyLogo.js').catch(() => ({ NETLIFY_LOGO_B64: null }));
  if (NETLIFY_LOGO_B64) doc.addImage('data:image/png;base64,' + NETLIFY_LOGO_B64, 'PNG', ML, y, 26, 10);
  if (quote.partner_name) {
    set(doc, { size: 8.5, color: C_MUTED });
    txt(doc, `× ${quote.partner_name}`, ML + 30, y + 7);
  }
  set(doc, { size: 8, color: C_MUTED });
  txt(doc, (quote.quote_number || '').replace('QUO-', 'QUOTE · '), PW - MR, y + 3, { align: 'right' });
  y += 16;
  rule(doc, y, { weight: 0.3 });
  y += 9;

  // ── CUSTOMER BLOCK ─────────────────────────────────────────────────────────
  set(doc, { style: 'bold', size: 16, color: C_BLACK });
  txt(doc, quote.customer_name || '', ML, y);

  // Quote meta — top right, stacked
  const metaItems = [
    quote.prepared_by     && ['Prepared by',  quote.prepared_by],
    quote.start_date      && ['Quote Date',   fmtDate(quote.start_date)],
    quote.expiration_date && ['Expires',      fmtDate(quote.expiration_date)],
  ].filter(Boolean);

  let metaY = y - 3;
  metaItems.forEach(([label, value]) => {
    set(doc, { size: 6.5, color: C_MUTED });
    txt(doc, label.toUpperCase(), PW - MR, metaY, { align: 'right' });
    metaY += 3.5;
    set(doc, { size: 9, color: C_INK });
    txt(doc, value, PW - MR, metaY, { align: 'right' });
    metaY += 5.5;
  });

  y += 6;
  if (quote.address) {
    set(doc, { size: 9, color: C_MUTED });
    const addrLines = doc.splitTextToSize(quote.address, CW * 0.55);
    doc.text(addrLines, ML, y);
    y += addrLines.length * 4.5;
  }

  y = Math.max(y, metaY) + 4;
  rule(doc, y);
  y += 8;

  // ── BILLING METADATA (3-col) ───────────────────────────────────────────────
  const colW = CW / 3;
  const cols = [ML, ML + colW, ML + colW * 2];

  const metaCols = [
    {
      label: 'Bill To',
      lines: [quote.contact_name, quote.contact_email].filter(Boolean),
    },
    {
      label: 'Billing Contact',
      lines: [
        quote.billing_contact_name,
        quote.billing_contact_email,
        quote.billing_contact_phone,
        quote.invoice_email ? `Invoice: ${quote.invoice_email}` : null,
      ].filter(Boolean),
    },
    {
      label: 'Contract Terms',
      lines: [
        quote.payment_terms    ? `Payment: ${quote.payment_terms}` : null,
        quote.billing_schedule ? `Billing: ${quote.billing_schedule}` : null,
        quote.payment_method   ? `Method: ${quote.payment_method}` : null,
        quote.start_date       ? `Start: ${fmtDate(quote.start_date)}` : null,
        quote.term_months      ? `Term: ${quote.term_months} Months` : null,
        quote.account_id       ? `Account ID: ${quote.account_id}` : null,
      ].filter(Boolean),
    },
  ];

  let maxColY = y;
  metaCols.forEach((col, i) => {
    if (!col.lines.length) return;
    let cy = y;
    cy = microLabel(doc, col.label, cols[i], cy);
    col.lines.forEach((line) => {
      set(doc, { size: 9, color: C_BODY });
      const wrapped = doc.splitTextToSize(line, colW - 4);
      doc.text(wrapped, cols[i], cy);
      cy += wrapped.length * 4.5;
    });
    maxColY = Math.max(maxColY, cy);
  });
  y = maxColY + 10;

  rule(doc, y, { weight: 0.3 });
  y += 10;

  // ── BASE PACKAGE ───────────────────────────────────────────────────────────
  const packageLines = allLines.filter(l => l.is_package);
  if (packageLines.length) {
    y = checkPage(doc, y, 16);
    set(doc, { size: 7, color: C_MUTED });
    txt(doc, 'BASE PACKAGE', ML, y);
    txt(doc, 'ANNUAL',  PW - MR,      y, { align: 'right' });
    txt(doc, 'MONTHLY', PW - MR - 40, y, { align: 'right' });
    y += 3.5;
    rule(doc, y);
    y += 7;

    packageLines.forEach((pkg) => {
      y = checkPage(doc, y, 20);
      const subs    = allLines.filter(l => l.parent_line_id === pkg.id);
      const monthly = pkg.net_price ?? pkg.list_price ?? 0;
      const annual  = monthly * 12;

      set(doc, { style: 'bold', size: 11.5, color: C_BLACK });
      txt(doc, getLineLabel(pkg), ML, y);
      set(doc, { size: 10, color: C_INK });
      txt(doc, fmtCurrency(annual),  PW - MR,      y, { align: 'right' });
      txt(doc, fmtCurrency(monthly), PW - MR - 40, y, { align: 'right' });
      y += 8;

      microLabel(doc, 'Included', ML, y);
      y += 1;

      subs.forEach((s) => {
        y = checkPage(doc, y, 5);
        const qty  = getEffectiveLineQuantity(s);
        const name = getLineLabel(s);
        set(doc, { size: 9.5, color: C_BODY });
        txt(doc, name, ML + 4, y);
        if (qty > 1) {
          set(doc, { size: 9.5, color: C_MUTED });
          txt(doc, fmtQty(qty), ML + 4 + doc.getTextWidth(name) + 2, y);
        }
        y += 5.5;
      });
      y += 5;
    });
  }

  // ── STANDALONE SUPPORT ─────────────────────────────────────────────────────
  const standaloneSupport = allLines.filter(l => !l.parent_line_id && !l.is_package && l.product_type === 'support');
  y = renderLineSection(doc, 'Support', standaloneSupport, getLineLabel, y);

  // ── PLATFORM ADD-ONS ───────────────────────────────────────────────────────
  const standaloneAddons = allLines.filter(l => !l.parent_line_id && !l.is_package && l.product_type === 'addon');
  y = renderLineSection(doc, 'Platform Add-Ons', standaloneAddons, getLineLabel, y);

  // ── ADDITIONAL ENTITLEMENTS ────────────────────────────────────────────────
  const standaloneEnt = allLines.filter(l => !l.parent_line_id && !l.is_package && ['entitlements', 'seats', 'credits'].includes(l.product_type));
  y = renderLineSection(doc, 'Additional Entitlements', standaloneEnt, getLineLabel, y);

  // ── CONSUMPTION LIMITS & OVERAGE RATES ────────────────────────────────────
  const overageRows = [];
  const seen = new Set();
  allLines.filter(l => ['seats', 'credits', 'entitlements'].includes(l.product_type)).forEach((l) => {
    const key = l.product_type === 'seats' ? 'Enterprise Seats' : l.product_type === 'credits' ? 'Credits' : l.product_name;
    if (seen.has(key)) return;
    seen.add(key);
    let overage = '—';
    if (l.product_type === 'seats'   && quote.overage_rate_seats)   overage = quote.overage_rate_seats;
    if (l.product_type === 'credits' && quote.overage_rate_credits) overage = quote.overage_rate_credits;
    overageRows.push([key, fmtQty(l.quantity), overage]);
  });
  if (overageRows.length) {
    y = sectionEyebrow(doc, 'Consumption Limits & Overage Rates', y);
    autoTable(doc, {
      startY: y - 3,
      head: [['', 'Included (Monthly)', 'Overage Rate']],
      body: overageRows,
      margin: { left: ML, right: MR },
      theme: 'plain',
      styles: { font: F, fontSize: 9.5, cellPadding: { top: 3.5, bottom: 3.5, left: 2, right: 2 }, textColor: C_BODY, lineWidth: 0 },
      headStyles: { font: F, fontStyle: 'normal', fontSize: 7, textColor: C_MUTED, cellPadding: { top: 1, bottom: 3, left: 2, right: 2 } },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 42 }, 2: { halign: 'right', cellWidth: 42 } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index > 0 && data.column.index === 0) {
          data.cell.styles.lineWidth = { top: 0.15 };
          data.cell.styles.lineColor = C_RULE;
        }
      },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── ORDER FORM HEADER TEXT ─────────────────────────────────────────────────
  const ofHtml = toRichTextHtml(settings?.orderFormHeaderText || '');
  if (!isRichTextEmpty(ofHtml)) {
    y = checkPage(doc, y, 18);
    set(doc, { size: 8.5, color: C_MUTED });
    y = renderRichText(doc, ofHtml, {
      x: ML, y, maxWidth: CW, fontSize: 9, lineHeight: 4.5, paragraphGap: 2, textColor: C_BODY,
      beforeLine: (nextY) => checkPage(doc, nextY, 6),
    });
    y += 8;
  }

  // ── TOTALS ─────────────────────────────────────────────────────────────────
  y = checkPage(doc, y, 50);
  rule(doc, y, { weight: 0.3 });
  y += 10;

  // Calculate list and net totals
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
  const finalACV      = netTotal - headerDiscAmt;
  const lineDiscAmt   = listTotal - netTotal;
  const totalDisc     = lineDiscAmt + headerDiscAmt;
  const hasDiscount   = totalDisc > 0.01;

  // Right-aligned totals block
  const summaryX = PW - MR - 116;
  const valueX   = PW - MR;

  const renderTotalRow = (label, value, { bold = false, large = false, topRule = false } = {}) => {
    y = checkPage(doc, y, 10);
    if (topRule) {
      rule(doc, y - 1, { x: summaryX, w: PW - MR - summaryX, weight: 0.2 });
      y += 2;
    }
    set(doc, { size: 7, color: C_MUTED });
    txt(doc, label.toUpperCase(), summaryX, y);
    const valSize = large ? 18 : 9;
    set(doc, { size: valSize, style: bold ? 'bold' : 'normal', color: large ? C_BLACK : C_BODY });
    txt(doc, value, valueX, large ? y + 4 : y, { align: 'right' });
    y += large ? 10 : 6;
  };

  if (hasDiscount) {
    renderTotalRow('Total Annual List Price', fmtCurrency(listTotal));
    if (headerDiscPct > 0 && lineDiscAmt > 0.01) {
      renderTotalRow('Line Discounts', `–${fmtCurrency(lineDiscAmt)}`);
      renderTotalRow(`Header Discount (${headerDiscPct}%)`, `–${fmtCurrency(headerDiscAmt)}`);
    } else {
      const discLabel = headerDiscPct > 0 ? `Discount (${headerDiscPct}%)` : 'Discount';
      renderTotalRow(discLabel, `–${fmtCurrency(totalDisc)}`);
    }
    renderTotalRow('Net Annual Fees', fmtCurrency(finalACV), { bold: true, large: true, topRule: true });
  } else {
    renderTotalRow('Net Annual Fees', fmtCurrency(finalACV), { bold: true, large: true });
  }

  // Monthly equiv
  set(doc, { size: 8, color: C_MUTED });
  txt(doc, `${fmtCurrency(finalACV / 12)} / month`, valueX, y, { align: 'right' });
  y += 5;

  // Multi-year badge
  if ((quote.term_months || 12) > 12) {
    set(doc, { size: 7, color: C_GOLD });
    txt(doc, `${quote.term_months}-Month Term`, valueX, y, { align: 'right' });
    y += 5;
  }

  y += 4;

  // Disclaimer
  set(doc, { size: 7, color: C_GHOST });
  const note = 'All prices are quoted in USD and are exclusive of any applicable taxes, commissions, import duties, or other similar fees.';
  const noteLines = doc.splitTextToSize(note, CW);
  doc.text(noteLines, ML, y);
  y += noteLines.length * 3.5 + 6;

  // ── TERMS & CONDITIONS ─────────────────────────────────────────────────────
  const termsSections = settings?.terms?.sections || [];
  const hasSettingsTerms = termsSections.some((s) => {
    return Boolean(s?.title?.trim()) || !isRichTextEmpty(toRichTextHtml(s?.body || ''));
  });
  const hasTerms = hasSettingsTerms || exhibitEntries.length > 0 || quote.terms_conditions?.trim();

  if (hasTerms) {
    doc.addPage();
    y = ML;

    set(doc, { style: 'bold', size: 14, color: C_BLACK });
    txt(doc, 'Terms & Conditions', ML, y);
    y += 4;
    rule(doc, y, { weight: 0.3 });
    y += 9;

    // Settings terms (boilerplate + custom sections)
    termsSections.forEach((section) => {
      const title   = section?.title?.trim() || '';
      const bodyHtml = toRichTextHtml(section?.body || '');
      const hasBody  = !isRichTextEmpty(bodyHtml);
      if (!title && !hasBody) return;
      y = checkPage(doc, y, 16);
      if (title) {
        set(doc, { style: 'bold', size: 10, color: C_BLACK });
        txt(doc, title, ML, y);
        y += 5;
      }
      if (hasBody) {
        y = renderRichText(doc, bodyHtml, {
          x: ML, y, maxWidth: CW, fontSize: 9, lineHeight: 4.5, paragraphGap: 2, textColor: C_BODY,
          beforeLine: (nextY) => checkPage(doc, nextY, 6),
        });
        y += 6;
      }
    });

    // Additional terms from quote field
    if (quote.terms_conditions?.trim()) {
      y = checkPage(doc, y, 20);
      set(doc, { style: 'bold', size: 10, color: C_BLACK });
      txt(doc, 'Additional Terms', ML, y);
      y += 3;
      rule(doc, y, { weight: 0.15 });
      y += 5;
      y = renderRichText(doc, toRichTextHtml(quote.terms_conditions.trim()), {
        x: ML, y, maxWidth: CW, fontSize: 9, lineHeight: 4.5, paragraphGap: 2, textColor: C_BODY,
        beforeLine: (nextY) => checkPage(doc, nextY, 6),
      });
      y += 6;
    }

    // Exhibit entries — product-level terms (e.g. Exhibit A service features)
    exhibitEntries.forEach((entry) => {
      y = checkPage(doc, y, 20);
      set(doc, { style: 'bold', size: 10, color: C_BLACK });
      txt(doc, `${entry.exhibitLabel} — ${entry.productName}`, ML, y);
      y += 3;
      rule(doc, y, { weight: 0.15 });
      y += 5;
      y = renderRichText(doc, entry.termsHtml, {
        x: ML, y, maxWidth: CW, fontSize: 9, lineHeight: 4.5, paragraphGap: 2, textColor: C_BODY,
        beforeLine: (nextY) => checkPage(doc, nextY, 6),
      });
      y += 8;
    });

    // ── SIGNATURE BLOCK ──────────────────────────────────────────────────────
    y = checkPage(doc, y, 60);
    y += 4;
    set(doc, { style: 'bold', size: 12, color: C_BLACK });
    txt(doc, 'Signature', ML, y);
    y += 3;
    rule(doc, y, { weight: 0.3 });
    y += 6;

    set(doc, { size: 8.5, color: C_MUTED });
    const sigNote = 'Your signature of this Order Form constitutes your agreement and consent to all terms referenced in this Order Form.';
    const sigNoteLines = doc.splitTextToSize(sigNote, CW);
    doc.text(sigNoteLines, ML, y);
    y += sigNoteLines.length * 4 + 8;

    const sigColW = (CW - 10) / 2;
    const sigCols = [ML, ML + sigColW + 10];
    const sigHeaders = ['Customer', 'Netlify, Inc.'];

    sigHeaders.forEach((header, i) => {
      set(doc, { style: 'bold', size: 10, color: C_BLACK });
      txt(doc, header, sigCols[i], y);
    });
    y += 14;

    const sigFields = ['Signature', 'Print Name', 'Title', 'Date'];
    sigFields.forEach((field) => {
      sigCols.forEach((x) => {
        set(doc, { size: 8.5, color: C_MUTED });
        txt(doc, `${field}:`, x, y);
        rule(doc, y + 1, { x: x + 18, w: sigColW - 22, weight: 0.3, color: [200, 200, 200] });
      });
      y += 12;
    });
  }

  addFooters(doc, quote.quote_number || '');

  // ── OUTPUT ─────────────────────────────────────────────────────────────────
  if (preview) {
    const pdfBlob = doc.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const win = window.open('', '_blank');
    if (win) {
      const title = quote.quote_number || 'Quote';
      win.document.write(
        `<html><head><title>${title}</title></head>` +
        `<body style="margin:0"><iframe src="${blobUrl}" style="border:none;position:fixed;top:0;left:0;width:100%;height:100%"></iframe></body></html>`
      );
      win.document.close();
      win.addEventListener('beforeunload', () => URL.revokeObjectURL(blobUrl), { once: true });
    } else {
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    }
  } else {
    const slug = (quote.customer_name || 'quote').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    doc.save(`${quote.quote_number}-${slug}.pdf`);
  }
}
