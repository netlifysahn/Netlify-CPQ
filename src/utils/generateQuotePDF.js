import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calcLineExtended, calcQuoteTotals, fmtCurrency, getEffectiveLineQuantity } from '../data/quotes';
import { isRichTextEmpty, renderRichText, toRichTextHtml } from './richText';

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const FONT        = 'helvetica';
const C_INK       = [53,  58,  53];
const C_SLATE     = [119, 128, 137];
const C_RULE      = [233, 235, 237];
const C_BLACK     = [26,  26,  26];
const C_MUTED     = [120, 120, 120];
const C_TEAL      = [0,  173, 159];
const C_GOLD      = [251, 177,  61];
const C_LIGHT     = [248, 248, 248];
const MARGIN      = 18;
const INDENT      = 4;
const EXHIBIT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── HELPERS ──────────────────────────────────────────────────────────────────
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtQty(n) {
  return n == null ? '' : Number(n).toLocaleString('en-US');
}

function checkPage(doc, y, needed = 30) {
  if (y + needed > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function toExhibitLabel(index) {
  let n = index, suffix = '';
  while (n >= 0) {
    suffix = EXHIBIT_CHARS[n % 26] + suffix;
    n = Math.floor(n / 26) - 1;
  }
  return `Exhibit ${suffix}`;
}

function collectLineTermExhibits(lines = []) {
  const exhibitEntries = [];
  const exhibitByLineId = new Map();
  const exhibitByLineRef = new Map();
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

function eyebrow(doc, text, y) {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text(text.toUpperCase(), MARGIN, y);
  return y + 5;
}

function divider(doc, y) {
  const w = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...C_RULE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, w - MARGIN, y);
  return y + 4;
}

function metaTable(doc, rows, y) {
  autoTable(doc, {
    startY: y,
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 4 }, textColor: C_BLACK },
    columnStyles: {
      0: { cellWidth: 52, textColor: C_MUTED, fontStyle: 'normal', font: FONT, fontSize: 7.5 },
      1: { cellWidth: 'auto', fontStyle: 'normal' },
    },
  });
  return doc.lastAutoTable.finalY + 4;
}

// Returns true if any line in the array has a line-level discount
function sectionHasDiscount(lines) {
  return lines.some(l => l.list_price != null && l.net_price != null && l.net_price < l.list_price);
}

// Build autoTable body rows with interleaved feature sub-rows.
// rowFn: (line) => array of cell values (length = colCount)
function buildSectionRows(lines, rowFn, colCount) {
  const rows = [];
  const meta = [];
  lines.forEach(l => {
    rows.push(rowFn(l));
    meta.push({ isFeature: false });
    (Array.isArray(l.features) ? l.features : []).forEach(f => {
      rows.push([f, ...Array(colCount - 1).fill('')]);
      meta.push({ isFeature: true });
    });
  });
  return { rows, meta };
}

// Shared autoTable style options for line-item sections
function sectionTableOptions(head, rows, meta, colStyles, pageWidth) {
  return {
    head,
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: {
      fontSize: 9.5,
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      textColor: C_BLACK,
      lineColor: C_RULE,
      lineWidth: 0,
    },
    headStyles: {
      fillColor: false,
      textColor: C_MUTED,
      fontStyle: 'normal',
      fontSize: 7.5,
      font: FONT,
      lineColor: C_RULE,
      lineWidth: { bottom: 0.25 },
    },
    columnStyles: colStyles,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const m = meta[data.row.index];
      if (!m) return;
      if (m.isFeature) {
        data.cell.styles.fontSize = 8;
        data.cell.styles.textColor = C_MUTED;
        data.cell.styles.cellPadding = { top: 1, bottom: 1, left: 10, right: 2 };
        data.cell.styles.fontStyle = 'normal';
      }
    },
  };
}

function confidentialFooter(doc) {
  const n = doc.internal.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 180, 180);
    const txt = 'Confidential \u2013 Do Not Distribute';
    doc.text(txt, (w - doc.getTextWidth(txt)) / 2, h - 10);
    doc.text(`${i} / ${n}`, w - MARGIN, h - 10, { align: 'right' });
  }
}

// ── MAIN EXPORT ──────────────────────────────────────────────────────────────
export async function generateQuotePDF(quote, products, settings, { preview = false } = {}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  const allLines = quote.line_items || [];
  const { exhibitEntries, exhibitByLineId, exhibitByLineRef } = collectLineTermExhibits(allLines);

  const getLineExhibit = (line) => {
    if (!line) return '';
    return (line.id && exhibitByLineId.get(line.id)) || exhibitByLineRef.get(line) || '';
  };
  const getLineLabel = (line, fallback = line?.product_name || 'Product') => {
    const exhibit = getLineExhibit(line);
    return exhibit ? `${fallback} (${exhibit})` : fallback;
  };

  let y = MARGIN;

  // ── DRAFT WATERMARK ──────────────────────────────────────────────────────
  if (quote.status === 'draft' || quote.status === 'draft_revision') {
    doc.saveGraphicsState();
    doc.setFont(FONT, 'bold');
    doc.setFontSize(72);
    doc.setTextColor(240, 240, 240);
    const wt = 'DRAFT';
    doc.text(wt, (pageWidth - doc.getTextWidth(wt)) / 2, 120);
    doc.restoreGraphicsState();
  }

  // ── HEADER ───────────────────────────────────────────────────────────────
  const { NETLIFY_LOGO_B64 } = await import('../assets/netlifyLogo.js').catch(() => ({ NETLIFY_LOGO_B64: null }));
  if (NETLIFY_LOGO_B64) {
    doc.addImage('data:image/png;base64,' + NETLIFY_LOGO_B64, 'PNG', MARGIN, y, 28, 11);
  }
  if (quote.partner_name) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C_MUTED);
    doc.text(`\u00D7 ${quote.partner_name}`, MARGIN + 32, y + 7);
  }

  const quoteNumDisplay = 'QUOTE - ' + (quote.quote_number || '').replace('QUO-', '');
  doc.setFont(FONT, 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...C_SLATE);
  doc.text(quoteNumDisplay, pageWidth - MARGIN, y + 2, { align: 'right' });
  y += 13;

  const headerMeta = [];
  if (quote.prepared_by)      headerMeta.push(`Prepared by ${quote.prepared_by}`);
  if (quote.start_date)       headerMeta.push(`Quote Date:   ${fmtDate(quote.start_date)}`);
  if (quote.expiration_date)  headerMeta.push(`Quote Expiration Date: ${fmtDate(quote.expiration_date)}`);
  headerMeta.forEach((line) => {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C_SLATE);
    doc.text(line, pageWidth - MARGIN, y, { align: 'right' });
    y += 4;
  });

  y += 2;
  y = divider(doc, y);
  y += 5;

  // ── CUSTOMER ─────────────────────────────────────────────────────────────
  if (quote.customer_name) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...C_INK);
    doc.text(quote.customer_name, MARGIN + INDENT, y);
    y += 4;
  }
  if (quote.address) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C_INK);
    const addrLines = doc.splitTextToSize(quote.address, contentWidth);
    doc.text(addrLines, MARGIN + INDENT, y);
    y += addrLines.length * 4 + 2;
  }
  y = divider(doc, y);

  // ── METADATA (3-column) ──────────────────────────────────────────────────
  const metaRows = [
    [
      { label: 'Primary Contact',  value: [quote.contact_name, quote.contact_email].filter(Boolean).join('\n') },
      { label: 'Billing Contact',  value: [quote.billing_contact_name, quote.billing_contact_email, quote.billing_contact_phone].filter(Boolean).join('\n') },
      { label: 'Invoice Email',    value: quote.invoice_email || '' },
    ],
    [
      { label: 'Payment Terms',    value: quote.payment_terms || '' },
      { label: 'Billing Schedule', value: quote.billing_schedule || '' },
      { label: 'Payment Method',   value: quote.payment_method || '' },
    ],
    [
      { label: 'Subscription Start Date', value: fmtDate(quote.start_date) },
      { label: 'Subscription Term',       value: quote.term_months ? `${quote.term_months} Months` : '' },
      { label: 'Netlify Account ID',      value: quote.account_id || '' },
    ],
  ];
  metaRows.forEach((row) => {
    const colWidth = contentWidth / 3;
    const cols = [MARGIN + INDENT, MARGIN + INDENT + colWidth, MARGIN + INDENT + colWidth * 2];
    if (!row.some(c => c.value && String(c.value).trim())) return;
    let colYs = [y, y, y];
    doc.setFontSize(6.5);
    doc.setTextColor(...C_SLATE);
    row.forEach((col, i) => {
      if (col.label && col.value?.trim()) { doc.text(col.label.toUpperCase(), cols[i], colYs[i]); colYs[i] += 3.5; }
    });
    doc.setFontSize(9);
    doc.setTextColor(...C_INK);
    row.forEach((col, i) => {
      col.value?.split('\n').forEach(line => { doc.text(line, cols[i], colYs[i]); colYs[i] += 4; });
    });
    y = Math.max(...colYs) + 2;
  });
  y = divider(doc, y);

  // ── BASE PACKAGE ─────────────────────────────────────────────────────────
  const packageLines = allLines.filter(l => l.is_package);
  if (packageLines.length > 0) {
    y = checkPage(doc, y, 40);

    // Eyebrow + column headers on the same line
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    doc.text('BASE PACKAGE', MARGIN, y);
    doc.text('ANNUAL PRICE',  pageWidth - MARGIN,      y, { align: 'right' });
    doc.text('MONTHLY PRICE', pageWidth - MARGIN - 42, y, { align: 'right' });
    y += 5;

    packageLines.forEach((pkg) => {
      y = checkPage(doc, y, 40);
      const subs = allLines.filter(l => l.parent_line_id === pkg.id);

      const pkgMonthly = pkg.net_price ?? pkg.list_price ?? 0;
      const pkgAnnual  = pkgMonthly * 12;

      // Package name row
      doc.setFont(FONT, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...C_BLACK);
      doc.text(getLineLabel(pkg), MARGIN + 6, y);
      doc.setFont(FONT, 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...C_BLACK);
      doc.text(fmtCurrency(pkgAnnual),  pageWidth - MARGIN,      y, { align: 'right' });
      doc.text(fmtCurrency(pkgMonthly), pageWidth - MARGIN - 42, y, { align: 'right' });
      y += 6;

      // Thin divider
      doc.setDrawColor(...C_RULE);
      doc.setLineWidth(0.2);
      doc.line(MARGIN + 6, y, pageWidth - MARGIN - 6, y);
      y += 5;

      // "INCLUDED" micro-label
      doc.setFont(FONT, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C_MUTED);
      doc.text('INCLUDED', MARGIN + 6, y);
      y += 5;

      // Sub-items: render as a clean list (name + qty if >1)
      subs.forEach((s) => {
        y = checkPage(doc, y, 6);
        const qty = getEffectiveLineQuantity(s);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...C_BLACK);
        doc.text(getLineLabel(s), MARGIN + 10, y);
        if (qty > 1) {
          doc.setTextColor(...C_MUTED);
          doc.text(fmtQty(qty), MARGIN + 10 + doc.getTextWidth(getLineLabel(s)) + 3, y);
        }
        y += 5;

        // Feature sub-bullets
        (Array.isArray(s.features) ? s.features : []).forEach(f => {
          y = checkPage(doc, y, 4);
          doc.setFont(FONT, 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...C_MUTED);
          const featureLines = doc.splitTextToSize(f, contentWidth - 20);
          doc.text(featureLines, MARGIN + 14, y);
          y += featureLines.length * 4;
        });
      });

      y += 8;
    });
  }

  // ── STANDALONE SUPPORT ───────────────────────────────────────────────────
  const standaloneSupport = allLines.filter(l => !l.parent_line_id && !l.is_package && l.product_type === 'support');
  if (standaloneSupport.length > 0) {
    y = checkPage(doc, y, 40);
    y = eyebrow(doc, 'Support', y);

    const hasDiscount = sectionHasDiscount(standaloneSupport);
    let head, colStyles, colCount;

    if (hasDiscount) {
      colCount = 4;
      head = [['', 'List Price', 'Disc. Monthly', 'Disc. Annual']];
      colStyles = {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 30 },
        2: { halign: 'right', cellWidth: 36 },
        3: { halign: 'right', cellWidth: 36 },
      };
    } else {
      colCount = 3;
      head = [['', 'Monthly Price', 'Annual Price']];
      colStyles = {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 40 },
        2: { halign: 'right', cellWidth: 40 },
      };
    }

    const { rows, meta } = buildSectionRows(standaloneSupport, (l) => {
      const list = l.list_price ?? 0;
      const net  = l.net_price  ?? l.list_price ?? 0;
      if (hasDiscount) return [getLineLabel(l), fmtCurrency(list), fmtCurrency(net), fmtCurrency(net * 12)];
      return [getLineLabel(l), fmtCurrency(net), fmtCurrency(net * 12)];
    }, colCount);

    autoTable(doc, { startY: y, ...sectionTableOptions(head, rows, meta, colStyles, pageWidth) });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── PLATFORM ADD-ONS ─────────────────────────────────────────────────────
  const standaloneAddons = allLines.filter(l => !l.parent_line_id && !l.is_package && l.product_type === 'addon');
  if (standaloneAddons.length > 0) {
    y = checkPage(doc, y, 40);
    y = eyebrow(doc, 'Platform Add-Ons', y);

    const hasDiscount = sectionHasDiscount(standaloneAddons);
    let head, colStyles, colCount;

    if (hasDiscount) {
      colCount = 4;
      head = [['', 'List Price', 'Disc. Monthly', 'Disc. Annual']];
      colStyles = {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 30 },
        2: { halign: 'right', cellWidth: 36 },
        3: { halign: 'right', cellWidth: 36 },
      };
    } else {
      colCount = 3;
      head = [['', 'Monthly Price', 'Annual Price']];
      colStyles = {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 40 },
        2: { halign: 'right', cellWidth: 40 },
      };
    }

    const { rows, meta } = buildSectionRows(standaloneAddons, (l) => {
      const list = l.list_price ?? 0;
      const net  = l.net_price  ?? l.list_price ?? 0;
      if (hasDiscount) return [getLineLabel(l), fmtCurrency(list), fmtCurrency(net), fmtCurrency(net * 12)];
      return [getLineLabel(l), fmtCurrency(net), fmtCurrency(net * 12)];
    }, colCount);

    autoTable(doc, { startY: y, ...sectionTableOptions(head, rows, meta, colStyles, pageWidth) });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── ADDITIONAL ENTITLEMENTS ──────────────────────────────────────────────
  const standaloneEnt = allLines.filter(l => !l.parent_line_id && !l.is_package && ['entitlements', 'seats', 'credits'].includes(l.product_type));
  if (standaloneEnt.length > 0) {
    y = checkPage(doc, y, 40);
    y = eyebrow(doc, 'Additional Entitlements', y);

    const hasDiscount = sectionHasDiscount(standaloneEnt);
    let head, colStyles, colCount;

    if (hasDiscount) {
      colCount = 5;
      head = [['', 'Qty', 'List Price', 'Disc. Unit', 'Disc. Annual']];
      colStyles = {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 22 },
        2: { halign: 'right',  cellWidth: 28 },
        3: { halign: 'right',  cellWidth: 28 },
        4: { halign: 'right',  cellWidth: 34 },
      };
    } else {
      colCount = 4;
      head = [['', 'Qty', 'Unit Price', 'Annual']];
      colStyles = {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 22 },
        2: { halign: 'right',  cellWidth: 32 },
        3: { halign: 'right',  cellWidth: 36 },
      };
    }

    const { rows, meta } = buildSectionRows(standaloneEnt, (l) => {
      const qty  = getEffectiveLineQuantity(l);
      const list = l.list_price ?? 0;
      const net  = l.net_price  ?? l.list_price ?? 0;
      const isCredLine = l.product_type === 'credits' && l.unit_type === 'per_credit';
      const annual = isCredLine ? net * qty : net * qty * 12;
      const listAnnual = isCredLine ? list * qty : list * qty * 12;

      if (hasDiscount) return [getLineLabel(l), fmtQty(qty), fmtCurrency(list), fmtCurrency(net), fmtCurrency(annual)];
      return [getLineLabel(l), fmtQty(qty), fmtCurrency(net), fmtCurrency(annual)];
    }, colCount);

    autoTable(doc, { startY: y, ...sectionTableOptions(head, rows, meta, colStyles, pageWidth) });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── CONSUMPTION LIMITS & OVERAGE RATES ───────────────────────────────────
  const overageRows = [];
  const seen = new Set();
  allLines
    .filter(l => ['seats', 'credits', 'entitlements'].includes(l.product_type))
    .forEach((l) => {
      const key = l.product_type === 'seats'
        ? 'Enterprise Seats'
        : l.product_type === 'credits'
          ? 'Credits'
          : l.product_name;
      if (seen.has(key)) return;
      seen.add(key);
      let overage = '\u2014';
      if (l.product_type === 'seats'   && quote.overage_rate_seats)   overage = quote.overage_rate_seats;
      if (l.product_type === 'credits' && quote.overage_rate_credits) overage = quote.overage_rate_credits;
      overageRows.push([key, fmtQty(l.quantity), overage]);
    });

  if (overageRows.length > 0) {
    y = checkPage(doc, y, 40);
    y = eyebrow(doc, 'Consumption Limits & Overage Rates', y);
    autoTable(doc, {
      startY: y,
      head: [['', 'Included', 'Overage Rate']],
      body: overageRows,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: C_BLACK, lineColor: C_RULE, lineWidth: 0 },
      headStyles: { fillColor: false, textColor: C_MUTED, fontStyle: 'normal', fontSize: 7.5, font: FONT, lineWidth: { bottom: 0.25 }, lineColor: C_RULE },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 40 },
        2: { halign: 'center', cellWidth: 40 },
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── ORDER FORM HEADER TEXT ────────────────────────────────────────────────
  const orderFormHeaderTextHtml = toRichTextHtml(settings?.orderFormHeaderText || '');
  if (!isRichTextEmpty(orderFormHeaderTextHtml)) {
    y = checkPage(doc, y, 18);
    y = renderRichText(doc, orderFormHeaderTextHtml, {
      x: MARGIN, y, maxWidth: contentWidth,
      fontSize: 9.5, lineHeight: 4.8, paragraphGap: 2, textColor: C_BLACK,
      beforeLine: (nextY) => checkPage(doc, nextY, 6),
    });
    y += 6;
  }

  // ── PRICING SUMMARY ───────────────────────────────────────────────────────
  y = checkPage(doc, y, 50);
  y = divider(doc, y);
  y = eyebrow(doc, 'Pricing Summary', y);

  // Calculate list total and net total separately so math is correct
  const priceableLines = allLines.filter(l => l.parent_line_id ? l.price_behavior === 'related' : true);

  const listAnnualTotal = priceableLines.reduce((s, l) => {
    const qty  = getEffectiveLineQuantity(l);
    const list = l.list_price ?? 0;
    const isCredLine = l.product_type === 'credits' && l.unit_type === 'per_credit';
    return s + (isCredLine ? list * qty : list * qty * 12);
  }, 0);

  const netAnnualTotal = priceableLines.reduce((s, l) => {
    const qty = getEffectiveLineQuantity(l);
    const net = l.net_price ?? l.list_price ?? 0;
    const isCredLine = l.product_type === 'credits' && l.unit_type === 'per_credit';
    return s + (isCredLine ? net * qty : net * qty * 12);
  }, 0);

  // Header-level discount applied on top of any line-level discounts
  const headerDiscPct = quote.header_discount || 0;
  const headerDiscAmt = netAnnualTotal * (headerDiscPct / 100);
  const finalACV      = netAnnualTotal - headerDiscAmt;

  const lineDiscAmt   = listAnnualTotal - netAnnualTotal;
  const totalDiscAmt  = lineDiscAmt + headerDiscAmt;
  const hasAnyDiscount = totalDiscAmt > 0.01;

  const summaryRows = [];
  if (hasAnyDiscount) {
    summaryRows.push(['List Price', fmtCurrency(listAnnualTotal)]);
    if (headerDiscPct > 0 && lineDiscAmt > 0.01) {
      summaryRows.push(['Line Discounts', `-${fmtCurrency(lineDiscAmt)}`]);
      summaryRows.push([`Header Discount (${headerDiscPct}%)`, `-${fmtCurrency(headerDiscAmt)}`]);
    } else if (headerDiscPct > 0) {
      summaryRows.push([`Discount (${headerDiscPct}%)`, `-${fmtCurrency(headerDiscAmt)}`]);
    } else {
      summaryRows.push(['Discount', `-${fmtCurrency(lineDiscAmt)}`]);
    }
  }
  summaryRows.push(['Net Annual Contract Value', fmtCurrency(finalACV)]);

  autoTable(doc, {
    startY: y,
    body: summaryRows,
    margin: { left: pageWidth - MARGIN - 120, right: MARGIN },
    theme: 'plain',
    styles: {
      fontSize: 9.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 0, right: 0 },
      textColor: C_BLACK,
    },
    columnStyles: {
      0: { cellWidth: 78, textColor: C_MUTED, font: FONT, fontSize: 7.5 },
      1: { cellWidth: 42, halign: 'right', fontStyle: 'normal' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === summaryRows.length - 1) {
        data.cell.styles.fontSize  = 13;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = C_BLACK;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  if ((quote.term_months || 12) > 12) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_GOLD);
    doc.text(`${quote.term_months}-MONTH TERM`, pageWidth - MARGIN, y, { align: 'right' });
    y += 5;
  }

  // Monthly equivalent note
  y += 2;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C_MUTED);
  doc.text(`${fmtCurrency(finalACV / 12)} / month`, pageWidth - MARGIN, y, { align: 'right' });
  y += 6;

  // Disclaimer
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 180, 180);
  const note = 'All prices are quoted in USD and are exclusive of any applicable taxes, commissions, import duties, or other similar fees.';
  const noteLines = doc.splitTextToSize(note, contentWidth);
  doc.text(noteLines, MARGIN, y);
  y += noteLines.length * 4 + 8;

  // ── TERMS & CONDITIONS ───────────────────────────────────────────────────
  const termsSections = settings?.terms?.sections || [];
  const hasSettingsTerms = termsSections.some((section) => {
    const title    = section?.title?.trim();
    const bodyHtml = toRichTextHtml(section?.body || '');
    return Boolean(title) || !isRichTextEmpty(bodyHtml);
  });
  const hasTerms = hasSettingsTerms || exhibitEntries.length > 0 || quote.terms_conditions?.trim();

  if (hasTerms) {
    doc.addPage();
    y = MARGIN;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C_BLACK);
    doc.text('Terms & Conditions', MARGIN, y);
    y += 10;

    termsSections.forEach((section) => {
      const title   = section?.title?.trim() || '';
      const bodyHtml = toRichTextHtml(section?.body || '');
      const hasBody  = !isRichTextEmpty(bodyHtml);
      if (!title && !hasBody) return;
      y = checkPage(doc, y, 16);
      if (title) {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...C_BLACK);
        doc.text(title, MARGIN, y);
        y += 5;
      }
      if (hasBody) {
        y = renderRichText(doc, bodyHtml, {
          x: MARGIN, y, maxWidth: contentWidth,
          fontSize: 9, lineHeight: 4.5, paragraphGap: 2, textColor: C_BLACK,
          beforeLine: (nextY) => checkPage(doc, nextY, 6),
        });
        y += 4;
      }
    });

    exhibitEntries.forEach((entry) => {
      y = checkPage(doc, y, 20);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...C_BLACK);
      doc.text(`${entry.exhibitLabel} \u2014 ${entry.productName}`, MARGIN, y);
      y += 5;
      y = renderRichText(doc, entry.termsHtml, {
        x: MARGIN, y, maxWidth: contentWidth,
        fontSize: 9, lineHeight: 4.5, paragraphGap: 2, textColor: C_BLACK,
        beforeLine: (nextY) => checkPage(doc, nextY, 6),
      });
      y += 4;
    });

    if (quote.terms_conditions?.trim()) {
      y = checkPage(doc, y, 20);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...C_BLACK);
      doc.text('Additional Terms', MARGIN, y);
      y += 5;
      y = renderRichText(doc, toRichTextHtml(quote.terms_conditions.trim()), {
        x: MARGIN, y, maxWidth: contentWidth,
        fontSize: 9, lineHeight: 4.5, paragraphGap: 2, textColor: C_BLACK,
        beforeLine: (nextY) => checkPage(doc, nextY, 6),
      });
    }
  }

  confidentialFooter(doc);

  // ── OUTPUT ────────────────────────────────────────────────────────────────
  if (preview) {
    const pdfBlob = doc.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const win = window.open('', '_blank');
    if (win) {
      const title = quote.quote_number || 'Quote';
      win.document.write(
        `<html><head><title>${title} Preview</title></head>` +
        `<body style="margin:0;padding:0"><iframe src="${blobUrl}" style="border:none;position:fixed;top:0;left:0;width:100%;height:100%" title="${title} PDF Preview"></iframe></body></html>`
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
