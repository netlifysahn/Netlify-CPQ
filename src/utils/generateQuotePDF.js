import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calcLineExtended, calcQuoteTotals, fmtCurrency, getEffectiveLineQuantity } from '../data/quotes';
import { isRichTextEmpty, renderRichText, toRichTextHtml } from './richText';


const FONT = 'helvetica';
const FONT_MONO = 'helvetica';
const C_INK = [53, 58, 53];
const C_SLATE = [119, 128, 137];
const C_RULE = [233, 235, 237];  // #E9EBED
const C_BLACK = [26, 26, 26];
const C_TEXT = [40, 40, 40];
const C_MUTED = [120, 120, 120];
const C_TEAL = [0, 173, 159];
const C_GOLD = [251, 177, 61];
const C_LIGHT = [248, 248, 248];
const MARGIN = 18;
const INDENT = 4;
const EXHIBIT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
  if (index < 0) return '';
  let n = index;
  let suffix = '';
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
    const entry = {
      line,
      exhibitLabel,
      productName: line?.product_name || 'Product',
      termsHtml,
    };
    exhibitEntries.push(entry);
    if (line?.id) exhibitByLineId.set(line.id, exhibitLabel);
    exhibitByLineRef.set(line, exhibitLabel);
  });

  return { exhibitEntries, exhibitByLineId, exhibitByLineRef };
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
  doc.setDrawColor(...C_RULE);
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
  const col3 = MARGIN + INDENT + (contentWidth / 3) * 2;

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
  doc.setFontSize(12);
  doc.setTextColor(...C_SLATE);
  doc.text(quoteNumDisplay, pageWidth - MARGIN, y + 2, { align: 'right' });

  y += 13;

  const headerMeta = [];
  if (quote.prepared_by) headerMeta.push(`Prepared by ${quote.prepared_by}`);
  if (quote.start_date) headerMeta.push(`Quote Date:   ${fmtDate(quote.start_date)}`);
  if (quote.expiration_date) headerMeta.push(`Quote Expiration Date: ${fmtDate(quote.expiration_date)}`);
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

  // ── CUSTOMER ──
  if (quote.customer_name) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...C_INK);
    doc.text(quote.customer_name, col1 + INDENT, y);
    y += 4;
  }
  if (quote.address) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C_INK);
    const addrLines = doc.splitTextToSize(quote.address, contentWidth);
    doc.text(addrLines, col1 + INDENT, y);
    y += addrLines.length * 4 + 2;
  }

  y = divider(doc, y);

  // ── METADATA TABLE: three-column layout ──
  const metaRows = [
    [
      { label: 'Primary Contact', value: [quote.contact_name, quote.contact_email].filter(Boolean).join('\n') },
      { label: 'Billing Contact', value: [quote.billing_contact_name, quote.billing_contact_email, quote.billing_contact_phone].filter(Boolean).join('\n') },
      { label: 'Invoice Email', value: quote.invoice_email || '' },
    ],
    [
      { label: 'Payment Terms', value: quote.payment_terms || '' },
      { label: 'Billing Schedule', value: quote.billing_schedule || '' },
      { label: 'Payment Method', value: quote.payment_method || '' },
    ],
    [
      { label: 'Subscription Start Date', value: fmtDate(quote.start_date) },
      { label: 'Subscription Term', value: quote.term_months ? `${quote.term_months} Months` : '' },
      { label: 'Netlify Account ID', value: quote.account_id || '' },
    ],
  ];

  metaRows.forEach((row) => {
    const colWidth = contentWidth / 3;
    const col2 = MARGIN + INDENT + colWidth;
    const col3 = MARGIN + INDENT + colWidth * 2;
    const cols = [col1 + INDENT, col2 + INDENT, col3 + INDENT];
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
      doc.text(getLineLabel(pkg), MARGIN + 6, y + 5);
      doc.setFont(FONT, 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...C_MUTED);
      doc.text(`${fmtCurrency(pkgTotal)} / mo`, pageWidth - MARGIN - 6, y + 5, { align: 'right' });
      y += 11;

      // Divider under header
      doc.setDrawColor(...C_RULE);
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
          const qty = getEffectiveLineQuantity(s);
          const qtyStr = qty > 1 ? ` (${fmtQty(qty)})` : '';
          doc.text(`${getLineLabel(s)}${qtyStr}`, MARGIN + 10, y);
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
      doc.text(getLineLabel(line), MARGIN + 6, y + 5);
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
      return [getLineLabel(l), fmtCurrency(mo), fmtCurrency(mo * 12)];
    });
    autoTable(doc, {
      startY: y,
      head: [['', 'Monthly', 'Annual']],
      body: addonRows,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: C_BLACK, lineColor: C_RULE, lineWidth: 0.2 },
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
      const quantity = getEffectiveLineQuantity(l);
      const isCredit = l.product_type === 'credits' && l.unit_type === 'per_credit';
      const annual = isCredit
        ? (l.net_price || l.list_price || 0) * quantity
        : (l.net_price || l.list_price || 0) * quantity * 12;
      return [getLineLabel(l), fmtQty(quantity), fmtCurrency(l.net_price || l.list_price || 0), fmtCurrency(annual)];
    });
    autoTable(doc, {
      startY: y,
      head: [['', 'Qty', 'Unit Price', 'Annual']],
      body: entRows,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: C_BLACK, lineColor: C_RULE, lineWidth: 0.2 },
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
      styles: { fontSize: 9, cellPadding: 3, textColor: C_BLACK, lineColor: C_RULE, lineWidth: 0.2 },
      headStyles: { fillColor: C_LIGHT, textColor: C_MUTED, fontStyle: 'normal', fontSize: 7.5, font: FONT_MONO },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'center', cellWidth: 40 }, 2: { halign: 'center', cellWidth: 40 } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  const orderFormHeaderTextHtml = toRichTextHtml(settings?.orderFormHeaderText || '');
  if (!isRichTextEmpty(orderFormHeaderTextHtml)) {
    y = checkPage(doc, y, 18);
    y = renderRichText(doc, orderFormHeaderTextHtml, {
      x: MARGIN,
      y,
      maxWidth: contentWidth,
      fontSize: 9.5,
      lineHeight: 4.8,
      paragraphGap: 2,
      textColor: C_BLACK,
      beforeLine: (nextY) => checkPage(doc, nextY, 6),
    });
    y += 6;
  }

  // ── PRICING SUMMARY ──
  y = checkPage(doc, y, 50);
  y = divider(doc, y);
  y = eyebrow(doc, 'Pricing Summary', y);

  const priceableLines = allLines.filter((l) => l.parent_line_id ? l.price_behavior === 'related' : true);
  const subtotal = priceableLines.reduce((s, l) => {
    const isCredit = l.product_type === 'credits' && l.unit_type === 'per_credit';
    const mo = (l.net_price || l.list_price || 0) * getEffectiveLineQuantity(l);
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

  const hasSettingsTerms = termsSections.some((section) => {
    const title = section?.title?.trim();
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
      const title = section?.title?.trim() || '';
      const bodyHtml = toRichTextHtml(section?.body || '');
      const hasBody = !isRichTextEmpty(bodyHtml);
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
          x: MARGIN,
          y,
          maxWidth: contentWidth,
          fontSize: 9,
          lineHeight: 4.5,
          paragraphGap: 2,
          textColor: C_BLACK,
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
      doc.setFont(FONT, 'normal');
      doc.setFontSize(9);
      y = renderRichText(doc, entry.termsHtml, {
        x: MARGIN,
        y,
        maxWidth: contentWidth,
        fontSize: 9,
        lineHeight: 4.5,
        paragraphGap: 2,
        textColor: C_BLACK,
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
      doc.setFont(FONT, 'normal');
      doc.setFontSize(9);
      y = renderRichText(doc, toRichTextHtml(quote.terms_conditions.trim()), {
        x: MARGIN,
        y,
        maxWidth: contentWidth,
        fontSize: 9,
        lineHeight: 4.5,
        paragraphGap: 2,
        textColor: C_BLACK,
        beforeLine: (nextY) => checkPage(doc, nextY, 6),
      });
    }
  }

  confidentialFooter(doc);

  // ── OUTPUT ──
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
      // Popup blocked: fall back to opening the object URL directly.
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    }
  } else {
    const slug = (quote.customer_name || 'quote').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    doc.save(`${quote.quote_number}-${slug}.pdf`);
  }
}
