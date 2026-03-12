import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calcLineExtended, calcQuoteTotals, fmtCurrency } from '../data/quotes';

const FONT_HEADING = 'helvetica';
const FONT_BODY = 'helvetica';
const FONT_MONO = 'courier';

const COLOR_TEXT = [26, 26, 26];
const COLOR_MUTED = [107, 114, 128];
const COLOR_TEAL = [0, 173, 159];
const COLOR_GOLD = [251, 177, 61];
const COLOR_DIVIDER = [230, 230, 230];

const MARGIN = 20;

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtQty(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('en-US');
}

function checkPage(doc, y, needed = 30) {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 25) { doc.addPage(); return MARGIN; }
  return y;
}

function drawEyebrow(doc, text, x, y) {
  doc.setFont(FONT_MONO, 'normal'); doc.setFontSize(8); doc.setTextColor(...COLOR_MUTED);
  doc.text(text.toUpperCase(), x, y); return y + 6;
}

function drawSubEyebrow(doc, text, x, y) {
  doc.setFont(FONT_MONO, 'normal'); doc.setFontSize(8); doc.setTextColor(...COLOR_TEAL);
  doc.text(text.toUpperCase(), x, y); return y + 5;
}

function drawDivider(doc, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...COLOR_DIVIDER); doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pageWidth - MARGIN, y); return y + 8;
}

function drawLabel(doc, label, x, y) {
  doc.setFont(FONT_MONO, 'normal'); doc.setFontSize(8); doc.setTextColor(...COLOR_MUTED);
  doc.text(label.toUpperCase(), x, y); return y + 4;
}

function drawValue(doc, value, x, y) {
  doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(10); doc.setTextColor(...COLOR_TEXT);
  doc.text(String(value || ''), x, y); return y + 5;
}

function drawConfidentialFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont(FONT_MONO, 'normal'); doc.setFontSize(8); doc.setTextColor(160, 160, 160);
    const pageH = doc.internal.pageSize.getHeight();
    const footerText = 'Confidential \u2013 Do Not Distribute';
    const tw = doc.getTextWidth(footerText);
    doc.text(footerText, (pageWidth - tw) / 2, pageH - 10);
  }
}

export function generateQuotePDF(quote, products, settings, { preview = false } = {}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  const allLines = quote.line_items || [];
  const totals = calcQuoteTotals(quote);
  let y = MARGIN;

  if (quote.status === 'draft' || quote.status === 'draft_revision') {
    doc.saveGraphicsState();
    doc.setTextColor(230, 230, 230); doc.setFontSize(60); doc.setFont(FONT_HEADING, 'bold');
    const wt = 'DRAFT';
    doc.text(wt, (pageWidth - doc.getTextWidth(wt)) / 2, 150);
    doc.restoreGraphicsState();
  }

  doc.setFont(FONT_HEADING, 'bold'); doc.setFontSize(18); doc.setTextColor(...COLOR_TEAL);
  doc.text('netlify', MARGIN, y + 2);

  if (quote.partner_name) {
    doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(9); doc.setTextColor(...COLOR_MUTED);
    doc.text(`in partnership with ${quote.partner_name}`, MARGIN + doc.getTextWidth('netlify') + 6, y + 2);
  }

  doc.setFont(FONT_HEADING, 'bold'); doc.setFontSize(14); doc.setTextColor(...COLOR_GOLD);
  doc.text(`QUOTE ${quote.quote_number}`, pageWidth - MARGIN, y, { align: 'right' });

  if (quote.quote_type) {
    const typeLabel = quote.quote_type.replace(/_/g, ' ').toUpperCase();
    y += 7;
    doc.setFont(FONT_MONO, 'normal'); doc.setFontSize(8); doc.setTextColor(...COLOR_MUTED);
    doc.text(typeLabel, pageWidth - MARGIN, y, { align: 'right' });
  } else { y += 7; }

  if (quote.expiration_date) {
    doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(9); doc.setTextColor(...COLOR_MUTED);
    doc.text(`Valid through ${fmtDate(quote.expiration_date)}`, pageWidth - MARGIN, y, { align: 'right' });
    y += 5;
  }
  if (quote.prepared_by) {
    doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(9); doc.setTextColor(...COLOR_MUTED);
    doc.text(`Prepared by: ${quote.prepared_by}`, pageWidth - MARGIN, y, { align: 'right' });
    y += 5;
  }
  y += 6;

  y = drawEyebrow(doc, 'Customer Information', MARGIN, y);
  if (quote.customer_name) {
    doc.setFont(FONT_HEADING, 'bold'); doc.setFontSize(16); doc.setTextColor(...COLOR_TEXT);
    doc.text(quote.customer_name, MARGIN, y); y += 7;
  }
  if (quote.address) {
    doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(10); doc.setTextColor(...COLOR_TEXT);
    const addrLines = doc.splitTextToSize(quote.address, contentWidth);
    doc.text(addrLines, MARGIN, y); y += addrLines.length * 4.5 + 4;
  }

  const col1x = MARGIN;
  const col2x = pageWidth / 2 + 5;
  let ly = y; let ry = y;

  if (quote.contact_name || quote.contact_email) {
    ly = drawLabel(doc, 'Primary Contact', col1x, ly);
    if (quote.contact_name) ly = drawValue(doc, quote.contact_name, col1x, ly);
    if (quote.contact_email) ly = drawValue(doc, quote.contact_email, col1x, ly);
    ly += 3;
  }
  if (quote.account_id) { ly = drawLabel(doc, 'Netlify Account ID', col1x, ly); ly = drawValue(doc, quote.account_id, col1x, ly); }

  if (quote.billing_contact_name || quote.billing_contact_email || quote.billing_contact_phone) {
    ry = drawLabel(doc, 'Billing Contact', col2x, ry);
    if (quote.billing_contact_name) ry = drawValue(doc, quote.billing_contact_name, col2x, ry);
    if (quote.billing_contact_email) ry = drawValue(doc, quote.billing_contact_email, col2x, ry);
    if (quote.billing_contact_phone) ry = drawValue(doc, quote.billing_contact_phone, col2x, ry);
    ry += 3;
  }
  if (quote.invoice_email) { ry = drawLabel(doc, 'Invoice Email', col2x, ry); ry = drawValue(doc, quote.invoice_email, col2x, ry); }

  y = Math.max(ly, ry) + 6;
  y = drawDivider(doc, y);

  if (quote.billing_schedule || quote.payment_terms || quote.po_number || quote.vat_number) {
    y = drawEyebrow(doc, 'Billing & Payment', MARGIN, y);
    ly = y; ry = y;
    if (quote.billing_schedule) { ly = drawLabel(doc, 'Billing Schedule', col1x, ly); ly = drawValue(doc, quote.billing_schedule, col1x, ly); ly += 2; }
    if (quote.payment_terms) { ly = drawLabel(doc, 'Payment Terms', col1x, ly); ly = drawValue(doc, quote.payment_terms, col1x, ly); }
    if (quote.po_number) { ry = drawLabel(doc, 'PO #', col2x, ry); ry = drawValue(doc, quote.po_number, col2x, ry); ry += 2; }
    if (quote.vat_number) { ry = drawLabel(doc, 'VAT #', col2x, ry); ry = drawValue(doc, quote.vat_number, col2x, ry); }
    y = Math.max(ly, ry) + 4;
    y = drawDivider(doc, y);
  }

  y = drawEyebrow(doc, 'Subscription Term', MARGIN, y);
  const termCols = [];
  if (quote.start_date) termCols.push({ label: 'Start Date', value: fmtDate(quote.start_date) });
  termCols.push({ label: 'Term', value: `${quote.term_months || 12} months` });
  if (quote.expiration_date) termCols.push({ label: 'Quote Expiration', value: fmtDate(quote.expiration_date) });
  const colW = contentWidth / termCols.length;
  termCols.forEach((col, i) => {
    const cx = MARGIN + colW * i;
    drawLabel(doc, col.label, cx, y);
    drawValue(doc, col.value, cx, y + 4);
  });
  y += 14;
  y = drawDivider(doc, y);

  const packageLines = allLines.filter((l) => l.is_package);
  if (packageLines.length > 0) {
    y = checkPage(doc, y, 40);
    y = drawEyebrow(doc, 'Base Package', MARGIN, y);
    packageLines.forEach((pkg) => {
      y = checkPage(doc, y, 40);
      const subs = allLines.filter((l) => l.parent_line_id === pkg.id);
      const pkgTotal = subs.reduce((s, l) => s + calcLineExtended(l), 0);
      doc.setDrawColor(...COLOR_DIVIDER); doc.setLineWidth(0.5);
      const cardStartY = y;
      doc.setFont(FONT_HEADING, 'bold'); doc.setFontSize(14); doc.setTextColor(...COLOR_TEXT);
      doc.text(pkg.product_name, MARGIN + 8, y + 6);
      doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(11);
      doc.text(`${fmtCurrency(pkgTotal)}/month`, pageWidth - MARGIN - 8, y + 6, { align: 'right' });
      y += 14;

      const platformSubs = subs.filter((s) => s.product_type === 'platform');
      const entitlementSubs = subs.filter((s) => ['entitlements', 'seats', 'credits'].includes(s.product_type));
      const supportSubs = subs.filter((s) => s.product_type === 'support');

      if (platformSubs.length > 0) {
        y = checkPage(doc, y, 15); y = drawSubEyebrow(doc, 'Platform', MARGIN + 8, y);
        platformSubs.forEach((s) => { y = checkPage(doc, y, 8); doc.setFont(FONT_BODY, 'bold'); doc.setFontSize(10); doc.setTextColor(...COLOR_TEXT); doc.text(s.product_name, MARGIN + 12, y); y += 5; });
        y += 3;
      }
      if (entitlementSubs.length > 0) {
        y = checkPage(doc, y, 15); y = drawSubEyebrow(doc, 'Entitlements', MARGIN + 8, y);
        entitlementSubs.forEach((s) => { y = checkPage(doc, y, 8); doc.setFont(FONT_BODY, 'bold'); doc.setFontSize(10); doc.setTextColor(...COLOR_TEXT); const qtyStr = s.quantity > 1 ? `  (${fmtQty(s.quantity)})` : ''; doc.text(`${s.product_name}${qtyStr}`, MARGIN + 12, y); y += 5; });
        y += 3;
      }
      if (supportSubs.length > 0) {
        y = checkPage(doc, y, 15); y = drawSubEyebrow(doc, 'Support', MARGIN + 8, y);
        supportSubs.forEach((s) => { y = checkPage(doc, y, 8); doc.setFont(FONT_BODY, 'bold'); doc.setFontSize(10); doc.setTextColor(...COLOR_TEXT); doc.text(s.product_name, MARGIN + 12, y); y += 5; });
        y += 3;
      }
      doc.roundedRect(MARGIN, cardStartY - 2, contentWidth, y - cardStartY + 4, 3, 3, 'S');
      y += 8;
    });
  }

  const standaloneSupportLines = allLines.filter((l) => !l.parent_line_id && !l.is_package && l.product_type === 'support');
  if (standaloneSupportLines.length > 0) {
    y = checkPage(doc, y, 30);
    y = drawEyebrow(doc, 'Support', MARGIN, y);
    standaloneSupportLines.forEach((line) => {
      y = checkPage(doc, y, 20);
      const cardStartY = y;
      doc.setFont(FONT_HEADING, 'bold'); doc.setFontSize(14); doc.setTextColor(...COLOR_TEXT);
      doc.text(line.product_name, MARGIN + 8, y + 6);
      doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(11);
      doc.text(`${fmtCurrency(line.net_price || line.list_price || 0)}/month`, pageWidth - MARGIN - 8, y + 6, { align: 'right' });
      y += 14;
      doc.setDrawColor(...COLOR_DIVIDER);
      doc.roundedRect(MARGIN, cardStartY - 2, contentWidth, y - cardStartY + 2, 3, 3, 'S');
      y += 8;
    });
  }

  const standaloneAddons = allLines.filter((l) => !l.parent_line_id && !l.is_package && l.product_type === 'addon');
  if (standaloneAddons.length > 0) {
    y = checkPage(doc, y, 40);
    y = drawEyebrow(doc, 'Platform Add-Ons', MARGIN, y);
    const addonHead = [['', 'MONTHLY PRICE', 'ANNUAL PRICE']];
    const addonBody = standaloneAddons.map((l) => {
      const monthly = l.net_price || l.list_price || 0;
      return [l.product_name, fmtCurrency(monthly), fmtCurrency(monthly * 12)];
    });
    const addonAnnualSubtotal = standaloneAddons.reduce((s, l) => s + (l.net_price || l.list_price || 0) * 12, 0);
    autoTable(doc, { startY: y, head: addonHead, body: addonBody, margin: { left: MARGIN, right: MARGIN }, theme: 'plain', styles: { fontSize: 9, cellPadding: 4, textColor: COLOR_TEXT, lineColor: COLOR_DIVIDER, lineWidth: 0.3 }, headStyles: { fillColor: [245, 245, 245], textColor: COLOR_MUTED, fontStyle: 'bold', fontSize: 8, font: FONT_MONO }, columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 38 }, 2: { halign: 'right', cellWidth: 38 } } });
    y = doc.lastAutoTable.finalY + 4;
    doc.setFont(FONT_BODY, 'bold'); doc.setFontSize(10); doc.setTextColor(...COLOR_TEXT);
    doc.text(`${fmtCurrency(addonAnnualSubtotal)} / year`, pageWidth - MARGIN, y, { align: 'right' });
    y += 10;
  }

  const standaloneEntitlements = allLines.filter((l) => !l.parent_line_id && !l.is_package && ['entitlements', 'seats', 'credits'].includes(l.product_type));
  if (standaloneEntitlements.length > 0) {
    y = checkPage(doc, y, 40);
    y = drawEyebrow(doc, 'Entitlements', MARGIN, y);
    const entHead = [['', 'QTY', 'UNIT PRICE', 'ANNUAL PRICE']];
    const entBody = standaloneEntitlements.map((l) => {
      const isAnnualCredit = l.product_type === 'credits' && l.unit_type === 'per_credit';
      const annualPrice = isAnnualCredit ? (l.net_price || l.list_price || 0) * (l.quantity || 1) : (l.net_price || l.list_price || 0) * (l.quantity || 1) * 12;
      return [l.product_name, fmtQty(l.quantity), fmtCurrency(l.net_price || l.list_price || 0), fmtCurrency(annualPrice)];
    });
    const entAnnualSubtotal = standaloneEntitlements.reduce((s, l) => {
      const isAnnualCredit = l.product_type === 'credits' && l.unit_type === 'per_credit';
      return s + (isAnnualCredit ? (l.net_price || l.list_price || 0) * (l.quantity || 1) : (l.net_price || l.list_price || 0) * (l.quantity || 1) * 12);
    }, 0);
    autoTable(doc, { startY: y, head: entHead, body: entBody, margin: { left: MARGIN, right: MARGIN }, theme: 'plain', styles: { fontSize: 9, cellPadding: 4, textColor: COLOR_TEXT, lineColor: COLOR_DIVIDER, lineWidth: 0.3 }, headStyles: { fillColor: [245, 245, 245], textColor: COLOR_MUTED, fontStyle: 'bold', fontSize: 8, font: FONT_MONO }, columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'center', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 38 }, 3: { halign: 'right', cellWidth: 38 } } });
    y = doc.lastAutoTable.finalY + 4;
    doc.setFont(FONT_BODY, 'bold'); doc.setFontSize(10); doc.setTextColor(...COLOR_TEXT);
    doc.text(`${fmtCurrency(entAnnualSubtotal)} / year`, pageWidth - MARGIN, y, { align: 'right' });
    y += 10;
  }

  const overageRows = [];
  const allEntLines = allLines.filter((l) => ['seats', 'credits', 'entitlements'].includes(l.product_type));
  const seen = new Set();
  allEntLines.forEach((l) => {
    const key = l.product_type === 'seats' ? 'Enterprise Seats' : l.product_type === 'credits' ? 'Credits' : l.product_name;
    if (seen.has(key)) return;
    seen.add(key);
    let overage = '';
    if (l.product_type === 'seats' && quote.overage_rate_seats) overage = quote.overage_rate_seats;
    else if (l.product_type === 'credits' && quote.overage_rate_credits) overage = quote.overage_rate_credits;
    overageRows.push([key, fmtQty(l.quantity), overage || '\u2014']);
  });

  if (overageRows.length > 0) {
    y = checkPage(doc, y, 40);
    y = drawEyebrow(doc, 'Consumption Limits & Overage Rates', MARGIN, y);
    autoTable(doc, { startY: y, head: [['', 'INCLUDED (MONTHLY)', 'OVERAGE RATES (MONTHLY)']], body: overageRows, margin: { left: MARGIN, right: MARGIN }, theme: 'plain', styles: { fontSize: 9, cellPadding: 4, textColor: COLOR_TEXT, lineColor: COLOR_DIVIDER, lineWidth: 0.3 }, headStyles: { fillColor: [245, 245, 245], textColor: COLOR_MUTED, fontStyle: 'bold', fontSize: 8, font: FONT_MONO }, columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'center', cellWidth: 40 }, 2: { halign: 'center', cellWidth: 45 } } });
    y = doc.lastAutoTable.finalY + 10;
  }

  y = checkPage(doc, y, 50);
  y = drawDivider(doc, y);
  y = drawEyebrow(doc, 'Pricing Summary', MARGIN, y);

  const priceableLines = allLines.filter((l) => { if (l.parent_line_id) return l.price_behavior === 'related'; return true; });
  const subtotal = priceableLines.reduce((s, l) => {
    const isAnnualCredit = l.product_type === 'credits' && l.unit_type === 'per_credit';
    const monthly = (l.net_price || l.list_price || 0) * (l.quantity || 1);
    return s + (isAnnualCredit ? monthly : monthly * 12);
  }, 0);

  const headerDiscountPct = quote.header_discount || 0;
  const discountAmount = subtotal * (headerDiscountPct / 100);
  const netACV = subtotal - discountAmount;
  const hasDiscount = discountAmount > 0;
  const totalsData = [];
  if (hasDiscount) { totalsData.push(['Subtotal', fmtCurrency(subtotal)]); totalsData.push([`Discount (${headerDiscountPct}%)`, `-${fmtCurrency(discountAmount)}`]); }
  totalsData.push(['Net Annual Contract Value', fmtCurrency(netACV)]);

  autoTable(doc, {
    startY: y,
    body: totalsData,
    margin: { left: pageWidth - MARGIN - 100, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 4, textColor: COLOR_TEXT },
    columnStyles: { 0: { fontStyle: 'normal', textColor: COLOR_MUTED, cellWidth: 60 }, 1: { fontStyle: 'bold', halign: 'right', cellWidth: 40 } },
    didParseCell: (data) => {
      if (data.row.index === totalsData.length - 1) { data.cell.styles.textColor = COLOR_TEAL; data.cell.styles.fontSize = 12; data.cell.styles.fontStyle = 'bold'; }
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  if ((quote.term_months || 12) > 12) {
    y = checkPage(doc, y, 12);
    doc.setFont(FONT_MONO, 'normal'); doc.setFontSize(8); doc.setTextColor(...COLOR_GOLD);
    doc.text(`${quote.term_months}-MONTH TERM`, pageWidth - MARGIN, y, { align: 'right' });
    y += 6;
  }

  doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(8); doc.setTextColor(160, 160, 160);
  const priceNote = 'All prices are quoted in USD and are exclusive of any applicable taxes, commissions, import duties, or other similar taxes or fees.';
  const noteLines = doc.splitTextToSize(priceNote, contentWidth);
  const noteWidth = doc.getTextWidth(noteLines[0]);
  doc.text(noteLines, (pageWidth - noteWidth) / 2, y);
  y += noteLines.length * 4 + 10;

  const termsSections = settings?.terms?.sections || [];
  const productTerms = [];
  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const seenProducts = new Set();
  allLines.forEach((l) => {
    if (seenProducts.has(l.product_id)) return;
    seenProducts.add(l.product_id);
    const prod = productMap.get(l.product_id);
    if (prod?.terms && prod.terms.trim()) productTerms.push({ name: prod.name, terms: prod.terms.trim() });
  });

  const hasTerms = termsSections.length > 0 || productTerms.length > 0 || (quote.terms_conditions && quote.terms_conditions.trim());
  if (hasTerms) {
    doc.addPage(); y = MARGIN;
    doc.setFont(FONT_HEADING, 'bold'); doc.setFontSize(16); doc.setTextColor(...COLOR_TEXT);
    doc.text('Terms & Conditions', MARGIN, y); y += 10;
    termsSections.forEach((section) => {
      y = checkPage(doc, y, 20);
      doc.setFont(FONT_HEADING, 'bold'); doc.setFontSize(11); doc.setTextColor(...COLOR_TEXT);
      doc.text(section.title, MARGIN, y); y += 6;
      if (section.body) {
        y = checkPage(doc, y, 10);
        doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(10); doc.setTextColor(...COLOR_TEXT);
        const bodyLines = doc.splitTextToSize(section.body, contentWidth);
        doc.text(bodyLines, MARGIN, y); y += bodyLines.length * 4.5 + 6;
      }
    });
    const exhibitLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    productTerms.forEach((pt, i) => {
      y = checkPage(doc, y, 20);
      doc.setFont(FONT_HEADING, 'bold'); doc.setFontSize(11); doc.setTextColor(...COLOR_TEXT);
      doc.text(`Exhibit ${exhibitLetters[i] || String(i + 1)} \u2014 ${pt.name}`, MARGIN, y); y += 6;
      doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(10); doc.setTextColor(...COLOR_TEXT);
      doc.splitTextToSize(pt.terms, contentWidth).forEach((line) => { y = checkPage(doc, y, 6); doc.text(line, MARGIN, y); y += 4.5; });
      y += 6;
    });
    if (quote.terms_conditions && quote.terms_conditions.trim()) {
      y = checkPage(doc, y, 20);
      doc.setFont(FONT_HEADING, 'bold'); doc.setFontSize(11); doc.setTextColor(...COLOR_TEXT);
      doc.text('Additional Terms', MARGIN, y); y += 6;
      doc.setFont(FONT_BODY, 'normal'); doc.setFontSize(10); doc.setTextColor(...COLOR_TEXT);
      doc.splitTextToSize(quote.terms_conditions.trim(), contentWidth).forEach((line) => { y = checkPage(doc, y, 6); doc.text(line, MARGIN, y); y += 4.5; });
    }
  }

  drawConfidentialFooter(doc);

  if (preview) {
    const url = doc.output('bloburl');
    window.open(url, '_blank');
  } else {
    const customerSlug = (quote.customer_name || 'quote').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    doc.save(`${quote.quote_number}-${customerSlug}.pdf`);
  }
}
