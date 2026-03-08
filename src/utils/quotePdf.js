import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { calcLineMonthly, calcLineTotal, calcQuoteTotals, fmtCurrency } from '../data/quotes';

export function generateQuotePdf(quote) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const totals = calcQuoteTotals(quote);
  let y = margin;

  // Draft watermark
  if (quote.status === 'draft') {
    doc.saveGraphicsState();
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(60);
    doc.setFont('helvetica', 'bold');
    const waterText = 'DRAFT';
    const textWidth = doc.getTextWidth(waterText);
    doc.text(waterText, (pageWidth - textWidth) / 2, 150, { angle: 0 });
    doc.restoreGraphicsState();
  }

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Quote', margin, y);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(quote.quote_number, pageWidth - margin, y, { align: 'right' });

  y += 10;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Quote name
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(quote.name || 'Untitled Quote', margin, y);
  y += 8;

  // Status
  const statusLabel = quote.status.charAt(0).toUpperCase() + quote.status.slice(1);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Status: ${statusLabel}`, margin, y);
  y += 12;

  // Two-column info section
  const col1x = margin;
  const col2x = pageWidth / 2 + 10;
  const infoFontSize = 9;
  const labelColor = [120, 120, 120];
  const valueColor = [30, 30, 30];

  const drawInfoRow = (label, value, x, yPos) => {
    doc.setFontSize(infoFontSize);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...labelColor);
    doc.text(label, x, yPos);
    doc.setTextColor(...valueColor);
    doc.text(String(value || '\u2014'), x + 45, yPos);
    return yPos + 6;
  };

  // Left column
  let ly = y;
  if (quote.customer_name) ly = drawInfoRow('Customer', quote.customer_name, col1x, ly);
  if (quote.customer_contact) ly = drawInfoRow('Contact', quote.customer_contact, col1x, ly);
  if (quote.prepared_by) ly = drawInfoRow('Prepared by', quote.prepared_by, col1x, ly);

  // Right column
  let ry = y;
  ry = drawInfoRow('Term', `${quote.term_months} months`, col2x, ry);
  if (quote.start_date) ry = drawInfoRow('Start date', quote.start_date, col2x, ry);
  if (quote.end_date) ry = drawInfoRow('End date', quote.end_date, col2x, ry);
  if (quote.header_discount > 0) ry = drawInfoRow('Discount', `${quote.header_discount}%`, col2x, ry);

  y = Math.max(ly, ry) + 8;

  // Line items table
  if (quote.line_items && quote.line_items.length > 0) {
    const hd = quote.header_discount || 0;
    const tableHead = [['Product', 'Qty', 'List Price', 'Sales Price', 'Discount', 'Monthly', 'Total']];
    const tableBody = quote.line_items.map((line) => {
      const monthly = calcLineMonthly(line, hd);
      const total = calcLineTotal(line, hd);
      return [
        line.product_name,
        String(line.quantity),
        fmtCurrency(line.list_price),
        fmtCurrency(line.sales_price),
        line.line_discount > 0 ? `${line.line_discount}%` : '\u2014',
        fmtCurrency(monthly),
        fmtCurrency(total),
      ];
    });

    doc.autoTable({
      startY: y,
      head: tableHead,
      body: tableBody,
      margin: { left: margin, right: margin },
      theme: 'plain',
      styles: {
        fontSize: 9,
        cellPadding: 4,
        textColor: [30, 30, 30],
        lineColor: [220, 220, 220],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [80, 80, 80],
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 18 },
        2: { halign: 'right', cellWidth: 28 },
        3: { halign: 'right', cellWidth: 28 },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 28 },
        6: { halign: 'right', cellWidth: 28 },
      },
    });

    y = doc.lastAutoTable.finalY + 8;

    // Totals
    const totalsData = [
      ['Monthly Total', fmtCurrency(totals.monthly)],
      ['Annual Total', fmtCurrency(totals.annual)],
      [`TCV (${quote.term_months}mo)`, fmtCurrency(totals.tcv)],
    ];

    doc.autoTable({
      startY: y,
      body: totalsData,
      margin: { left: pageWidth - margin - 80, right: margin },
      theme: 'plain',
      styles: {
        fontSize: 9,
        cellPadding: 3,
        textColor: [30, 30, 30],
      },
      columnStyles: {
        0: { fontStyle: 'normal', textColor: [100, 100, 100], cellWidth: 45 },
        1: { fontStyle: 'bold', halign: 'right', cellWidth: 35 },
      },
    });

    y = doc.lastAutoTable.finalY + 10;
  }

  // Comments
  if (quote.comments) {
    if (y > 250) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Comments', margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    const commentLines = doc.splitTextToSize(quote.comments, pageWidth - margin * 2);
    doc.text(commentLines, margin, y);
    y += commentLines.length * 5 + 8;
  }

  // Terms & Conditions
  if (quote.terms_conditions) {
    if (y > 250) { doc.addPage(); y = margin; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Terms & Conditions', margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    const tcLines = doc.splitTextToSize(quote.terms_conditions, pageWidth - margin * 2);
    doc.text(tcLines, margin, y);
  }

  // Footer on each page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    const pageH = doc.internal.pageSize.getHeight();
    doc.text(
      `${quote.quote_number} \u2022 Generated ${new Date().toLocaleDateString()}`,
      margin,
      pageH - 10,
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageH - 10, { align: 'right' });
  }

  doc.save(`${quote.quote_number}.pdf`);
}
