import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calcLineExtended, calcQuoteTotals, fmtCurrency } from '../data/quotes';


const FONT = 'helvetica';
const FONT_MONO = 'helvetica';
const C_BLACK = [26, 26, 26];
const C_TEXT = [40, 40, 40];
const C_MUTED = [120, 120, 120];
const C_DIVIDER = [220, 220, 220];
const C_TEAL = [0, 173, 159];
const C_GOLD = [251, 177, 61];
const C_LIGHT = [248, 248, 248];
const MARGIN = 18;
const INDENT = 4;

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

function eyebrow(doc, text, y) {
  doc.setFont(FONT_MONO, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text(text.toUpperCase(), MARGIN, y);
  return y + 5;
}

function divider(doc, y) {
  const w = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...C_DIVIDER);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, w - MARGIN, y);
  return y + 4;
}

function metaTable(doc, rows, y) {
  // rows: [[label, value], ...]
  // Renders as a clean label/value table, single column
  autoTable(doc, {
    startY: y,
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 4 }, textColor: C_BLACK },
    columnStyles: {
      0: { cellWidth: 52, textColor: C_MUTED, fontStyle: 'normal', font: FONT_MONO, fontSize: 7.5 },
      1: { cellWidth: 'auto', fontStyle: 'normal' },
    },
  });
  return doc.lastAutoTable.finalY + 4;
}

function confidentialFooter(doc) {
  const n = doc.internal.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont(FONT_MONO, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 180, 180);
    const txt = 'Confidential \u2013 Do Not Distribute';
    doc.text(txt, (w - doc.getTextWidth(txt)) / 2, h - 10);
    doc.setTextColor(180, 180, 180);
    doc.text(`${i} / ${n}`, w - MARGIN, h - 10, { align: 'right' });
  }
}

export async function generateQuotePDF(quote, products, settings, { preview = false } = {}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  const allLines = quote.line_items || [];
  let y = MARGIN;

  // ── DRAFT WATERMARK ──
  if (quote.status === 'draft' || quote.status === 'draft_revision') {
    doc.saveGraphicsState();
    doc.setFont(FONT, 'bold');
    doc.setFontSize(72);
    doc.setTextColor(240, 240, 240);
    const wt = 'DRAFT';
    doc.text(wt, (pageWidth - doc.getTextWidth(wt)) / 2, 120);
    doc.restoreGraphicsState();
  }

  // ── HEADER ──
  const col1 = MARGIN;
  const col2 = pageWidth / 2 + 5;

  // Logo
  const { NETLIFY_LOGO_B64 } = await import('../assets/netlifyLogo.js').catch(() => ({ NETLIFY_LOGO_B64: null }));
  if (NETLIFY_LOGO_B64) {
    doc.addImage('data:image/png;base64,' + NETLIFY_LOGO_B64, 'PNG', col1, y, 28, 11);
  }

  if (quote.partner_name) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C_MUTED);
    doc.text(`\u00D7 ${quote.partner_name}`, col1 + 32, y + 7);
  }

  // Quote number top right
  const quoteNumDisplay = 'QUOTE - ' + (quote.quote_number || '').replace('QUO-', '');
  doc.setFont(FONT, 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...C_MUTED);
  doc.text(quoteNumDisplay, pageWidth - MARGIN, y + 2, { align: 'right' });

  y += 13;

  const headerMeta = [];
  if (quote.prepared_by) headerMeta.push(`Prepared by ${quote.prepared_by}`);
  if (quote.start_date) headerMeta.push(`Quote Date:   ${fmtDate(quote.start_date)}`);
  if (quote.expiration_date) headerMeta.push(`Quote Expiration Date: ${fmtDate(quote.expiration_date)}`);
  headerMeta.forEach((line) => {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C_MUTED);
    doc.text(line, pageWidth - MARGIN, y, { align: 'right' });
    y += 4;
  });

  y += 2;
  y = divider(doc, y);
  y += 3;

  // ── CUSTOMER ──
  if (quote.customer_name) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...C_BLACK);
    doc.text(quote.customer_name, col1 + INDENT, y);
    y += 5;
  }
  if (quote.address) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C_MUTED);
    const addrLines = doc.splitTextToSize(quote.address, contentWidth);
    doc.text(addrLines, col1 + INDENT, y);
    y += addrLines.length * 4 + 3;
  }
  y += 3;

  y = divider(doc, y);

  // ── METADATA TABLE: two-column, no internal dividers ──
  const metaRows = [];

  const primaryVal = [quote.contact_name, quote.contact_email].filter(Boolean).join('\n');
  const billingVal = [quote.billing_contact_name, quote.billing_contact_email, quote.billing_contact_phone].filter(Boolean).join('\n');
  if (primaryVal || billingVal) metaRows.push([{ label: 'Primary Contact', value: primaryVal }, { label: 'Billing Contact', value: billingVal }]);

  const accountVal = quote.account_id || '';
  const invoiceVal = quote.invoice_email || '';
  if (accountVal || invoiceVal) metaRows.push([{ label: 'Netlify Account ID', value: accountVal }, { label: 'Invoice Email', value: invoiceVal }]);

  const billingSchedVal = quote.billing_schedule || '';
  const paymentTermsVal = quote.payment_terms || '';
  if (billingSchedVal || paymentTermsVal) metaRows.push([{ label: 'Billing Schedule', value: billingSchedVal }, { label: 'Payment Terms', value: paymentTermsVal }]);

  const paymentMethodVal = quote.payment_method || '';
  const poVal = quote.po_number || '';
  if (paymentMethodVal || poVal) metaRows.push([{ label: 'Payment Method', value: paymentMethodVal }, { label: 'PO #', value: poVal }]);

  const termVal = `${quote.term_months || 12} Months`;
  const startVal = fmtDate(quote.start_date);
  metaRows.push([{ label: 'Subscription Term', value: termVal }, { label: 'Subscription Start Date', value: startVal }]);

  metaRows.forEach((row) => {
    const [left, right] = row;
    // Labels
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_MUTED);
    if (left.label) doc.text(left.label.toUpperCase(), col1 + INDENT, y);
    if (right.label) doc.text(right.label.toUpperCase(), col2 + INDENT, y);
    y += 4;
    // Values (handle multiline)
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...C_BLACK);
    const leftLines = left.value ? left.value.split('\n') : [];
    const rightLines = right.value ? right.value.split('\n') : [];
    const maxL = Math.max(leftLines.length, rightLines.length, 1);
    for (let i = 0; i < maxL; i++) {
      if (leftLines[i]) doc.text(leftLines[i], col1 + INDENT, y);
      if (rightLines[i]) doc.text(rightLines[i], col2 + INDENT, y);
      y += 4.5;
    }
    y += 2;
  });

  y += 2;
  y = divider(doc, y);

  // ── BASE PACKAGE ──
  const packageLines = allLines.filter((l) => l.is_package);
  if (packageLines.length > 0) {
    y = checkPage(doc, y, 40);
    y = eyebrow(doc, 'Base Package', y);

    packageLines.forEach((pkg) => {
      y = checkPage(doc, y, 40);
      const subs = allLines.filter((l) => l.parent_line_id === pkg.id);
      const pkgTotal = subs.reduce((s, l) => s + calcLineExtended(l), 0);

      // Package name + monthly price
      doc.setFont(FONT, 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...C_BLACK);
      doc.text(pkg.product_name, MARGIN + 6, y + 5);
      doc.setFont(FONT, 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...C_MUTED);
      doc.text(`${fmtCurrency(pkgTotal)} / mo`, pageWidth - MARGIN - 6, y + 5, { align: 'right' });
      y += 11;

      // Divider under header
      doc.setDrawColor(...C_DIVIDER);
      doc.line(MARGIN + 6, y, pageWidth - MARGIN - 6, y);
      y += 5;

      const groups = [
        { label: 'Platform', types: ['platform'] },
        { label: 'Entitlements', types: ['entitlements', 'seats', 'credits'] },
        { label: 'Support', types: ['support'] },
      ];

      groups.forEach(({ label, types }) => {
        const items = subs.filter((s) => types.includes(s.product_type));
        if (!items.length) return;
        y = checkPage(doc, y, 10);
        doc.setFont(FONT_MONO, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...C_MUTED);
        doc.text(label.toUpperCase(), MARGIN + 6, y);
        y += 4;
        items.forEach((s) => {
          y = checkPage(doc, y, 6);
          doc.setFont(FONT, 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(...C_BLACK);
          const qtyStr = s.quantity > 1 ? ` (${fmtQty(s.quantity)})` : '';
          doc.text(`${s.product_name}${qtyStr}`, MARGIN + 10, y);
          y += 5;
        });
        y += 2;
      });

      y += 8;
    });
  }

  // ── STANDALONE SUPPORT ──
  const standaloneSupport = allLines.filter((l) => !l.parent_line_id && !l.is_package && l.product_type === 'support');
  if (standaloneSupport.length > 0) {
    y = checkPage(doc, y, 30);
    y = eyebrow(doc, 'Support', y);
    standaloneSupport.forEach((line) => {
      y = checkPage(doc, y, 16);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...C_BLACK);
      doc.text(line.product_name, MARGIN + 6, y + 5);
      doc.setFont(FONT, 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...C_MUTED);
      doc.text(`${fmtCurrency(line.net_price || line.list_price || 0)} / mo`, pageWidth - MARGIN - 6, y + 5, { align: 'right' });
      y += 11;
      y += 8;
    });
  }

  // ── PLATFORM ADD-ONS ──
  const standaloneAddons = allLines.filter((l) => !l.parent_line_id && !l.is_package && l.product_type === 'addon');
  if (standaloneAddons.length > 0) {
    y = checkPage(doc, y, 40);
    y = eyebrow(doc, 'Platform Add-Ons', y);
    const addonRows = standaloneAddons.map((l) => {
      const mo = l.net_price || l.list_price || 0;
      return [l.product_name, fmtCurrency(mo), fmtCurrency(mo * 12)];
    });
    autoTable(doc, {
      startY: y,
      head: [['', 'Monthly', 'Annual']],
      body: addonRows,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: C_BLACK, lineColor: C_DIVIDER, lineWidth: 0.2 },
      headStyles: { fillColor: C_LIGHT, textColor: C_MUTED, fontStyle: 'normal', fontSize: 7.5, font: FONT_MONO },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 35 }, 2: { halign: 'right', cellWidth: 35 } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── ENTITLEMENTS ──
  const standaloneEnt = allLines.filter((l) => !l.parent_line_id && !l.is_package && ['entitlements', 'seats', 'credits'].includes(l.product_type));
  if (standaloneEnt.length > 0) {
    y = checkPage(doc, y, 40);
    y = eyebrow(doc, 'Entitlements', y);
    const entRows = standaloneEnt.map((l) => {
      const isCredit = l.product_type === 'credits' && l.unit_type === 'per_credit';
      const annual = isCredit
        ? (l.net_price || l.list_price || 0) * (l.quantity || 1)
        : (l.net_price || l.list_price || 0) * (l.quantity || 1) * 12;
      return [l.product_name, fmtQty(l.quantity), fmtCurrency(l.net_price || l.list_price || 0), fmtCurrency(annual)];
    });
    autoTable(doc, {
      startY: y,
      head: [['', 'Qty', 'Unit Price', 'Annual']],
      body: entRows,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: C_BLACK, lineColor: C_DIVIDER, lineWidth: 0.2 },
      headStyles: { fillColor: C_LIGHT, textColor: C_MUTED, fontStyle: 'normal', fontSize: 7.5, font: FONT_MONO },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'center', cellWidth: 20 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 32 } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── OVERAGE RATES ──
  const overageRows = [];
  const seen = new Set();
  allLines.filter((l) => ['seats', 'credits', 'entitlements'].includes(l.product_type)).forEach((l) => {
    const key = l.product_type === 'seats' ? 'Enterprise Seats' : l.product_type === 'credits' ? 'Credits' : l.product_name;
    if (seen.has(key)) return;
    seen.add(key);
    let overage = '\u2014';
    if (l.product_type === 'seats' && quote.overage_rate_seats) overage = quote.overage_rate_seats;
    if (l.product_type === 'credits' && quote.overage_rate_credits) overage = quote.overage_rate_credits;
    overageRows.push([key, fmtQty(l.quantity), overage]);
  });
  if (overageRows.length > 0) {
    y = checkPage(doc, y, 40);
    y = eyebrow(doc, 'Consumption Limits & Overage Rates', y);
    autoTable(doc, {
      startY: y,
      head: [['', 'Included (Monthly)', 'Overage Rate']],
      body: overageRows,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: C_BLACK, lineColor: C_DIVIDER, lineWidth: 0.2 },
      headStyles: { fillColor: C_LIGHT, textColor: C_MUTED, fontStyle: 'normal', fontSize: 7.5, font: FONT_MONO },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'center', cellWidth: 40 }, 2: { halign: 'center', cellWidth: 40 } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── PRICING SUMMARY ──
  y = checkPage(doc, y, 50);
  y = divider(doc, y);
  y = eyebrow(doc, 'Pricing Summary', y);

  const priceableLines = allLines.filter((l) => l.parent_line_id ? l.price_behavior === 'related' : true);
  const subtotal = priceableLines.reduce((s, l) => {
    const isCredit = l.product_type === 'credits' && l.unit_type === 'per_credit';
    const mo = (l.net_price || l.list_price || 0) * (l.quantity || 1);
    return s + (isCredit ? mo : mo * 12);
  }, 0);

  const discPct = quote.header_discount || 0;
  const discAmt = subtotal * (discPct / 100);
  const netACV = subtotal - discAmt;
  const hasDiscount = discAmt > 0;

  const summaryRows = [];
  if (hasDiscount) {
    summaryRows.push(['List Price', fmtCurrency(subtotal)]);
    summaryRows.push([`Discount (${discPct}%)`, `-${fmtCurrency(discAmt)}`]);
  }
  summaryRows.push(['Net Annual Contract Value', fmtCurrency(netACV)]);

  autoTable(doc, {
    startY: y,
    body: summaryRows,
    margin: { left: pageWidth - MARGIN - 110, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: { top: 2, bottom: 2, left: 0, right: 0 }, textColor: C_BLACK },
    columnStyles: {
      0: { cellWidth: 68, textColor: C_MUTED, font: FONT_MONO, fontSize: 7.5 },
      1: { cellWidth: 42, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index === summaryRows.length - 1) {
        data.cell.styles.fontSize = 13;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = C_BLACK;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  if ((quote.term_months || 12) > 12) {
    doc.setFont(FONT_MONO, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_GOLD);
    doc.text(`${quote.term_months}-MONTH TERM`, pageWidth - MARGIN, y, { align: 'right' });
    y += 5;
  }

  // Disclaimer
  y += 2;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 180, 180);
  const note = 'All prices are quoted in USD and are exclusive of any applicable taxes, commissions, import duties, or other similar fees.';
  const noteLines = doc.splitTextToSize(note, contentWidth);
  doc.text(noteLines, MARGIN, y);
  y += noteLines.length * 4 + 8;

  // ── TERMS & CONDITIONS ──
  const termsSections = settings?.terms?.sections || [];
  const productTerms = [];
  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const seenProds = new Set();
  allLines.forEach((l) => {
    if (seenProds.has(l.product_id)) return;
    seenProds.add(l.product_id);
    const prod = productMap.get(l.product_id);
    if (prod?.terms?.trim()) productTerms.push({ name: prod.name, terms: prod.terms.trim() });
  });

  const hasTerms = termsSections.length > 0 || productTerms.length > 0 || quote.terms_conditions?.trim();
  if (hasTerms) {
    doc.addPage();
    y = MARGIN;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C_BLACK);
    doc.text('Terms & Conditions', MARGIN, y);
    y += 10;

    termsSections.forEach((section) => {
      y = checkPage(doc, y, 20);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...C_BLACK);
      doc.text(section.title, MARGIN, y);
      y += 5;
      if (section.body) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...C_BLACK);
        const lines = doc.splitTextToSize(section.body, contentWidth);
        lines.forEach((l) => { y = checkPage(doc, y, 6); doc.text(l, MARGIN, y); y += 4.5; });
        y += 4;
      }
    });

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    productTerms.forEach((pt, i) => {
      y = checkPage(doc, y, 20);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...C_BLACK);
      doc.text(`Exhibit ${letters[i] || i + 1} \u2014 ${pt.name}`, MARGIN, y);
      y += 5;
      doc.setFont(FONT, 'normal');
      doc.setFontSize(9);
      doc.splitTextToSize(pt.terms, contentWidth).forEach((l) => { y = checkPage(doc, y, 6); doc.text(l, MARGIN, y); y += 4.5; });
      y += 4;
    });

    if (quote.terms_conditions?.trim()) {
      y = checkPage(doc, y, 20);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...C_BLACK);
      doc.text('Additional Terms', MARGIN, y);
      y += 5;
      doc.setFont(FONT, 'normal');
      doc.setFontSize(9);
      doc.splitTextToSize(quote.terms_conditions.trim(), contentWidth).forEach((l) => { y = checkPage(doc, y, 6); doc.text(l, MARGIN, y); y += 4.5; });
    }
  }

  confidentialFooter(doc);

  // ── OUTPUT ──
  if (preview) {
    const dataUri = doc.output('datauristring');
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(
        `<html><head><title>${quote.quote_number || 'Quote'} Preview</title></head>` +
        `<body style="margin:0;padding:0"><iframe src="${dataUri}" style="border:none;position:fixed;top:0;left:0;width:100%;height:100%"></iframe></body></html>`
      );
    }
  } else {
    const slug = (quote.customer_name || 'quote').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    doc.save(`${quote.quote_number}-${slug}.pdf`);
  }
}
