import { createBrandedPdf, drawDivider, drawSectionHeading, formatCurrency, PDF_BRAND } from './branding';

export const createFeeCollectionReportPdf = (jsPDFConstructor, { entries = [], summaryText = '', schoolName }) => {
  const { doc, contentBounds, addBrandedPage } = createBrandedPdf(jsPDFConstructor);
  let bounds = contentBounds;
  let y = bounds.startY;

  const columns = [
    { key: 'student', label: 'Student', width: 0.22 },
    { key: 'class', label: 'Class/Section', width: 0.12 },
    { key: 'cycle', label: 'Cycle / Term', width: 0.14 },
    { key: 'status', label: 'Status', width: 0.12 },
    { key: 'amount', label: 'Amount / Balance', width: 0.18 },
    { key: 'dates', label: 'Due / Paid', width: 0.12 },
    { key: 'mode', label: 'Mode / Txn', width: 0.1 },
  ];

  const addPageIfNeeded = (space = 12, withHeader = false) => {
    if (y + space > bounds.maxY) {
      bounds = addBrandedPage();
      y = bounds.startY;
      if (withHeader) {
        drawTableHeader();
      }
    }
  };

  drawSectionHeading(doc, { ...bounds, startY: y }, 'Fee Collection Report', schoolName || 'Elden Heights School');
  y += 13;

  doc.setFont(PDF_BRAND.headerFont, 'normal');
  doc.setFontSize(10.5);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, bounds.left, y);
  y += 6;

  doc.setFillColor(PDF_BRAND.softAccent);
  doc.setDrawColor(PDF_BRAND.strokeMuted);
  const filterLines = doc.splitTextToSize(summaryText || 'No filters applied', bounds.width - 6);
  const filterHeight = Math.max(10, filterLines.length * 4 + 6);
  doc.roundedRect(bounds.left - 1, y - 4, bounds.width + 2, filterHeight, 2, 2, 'FD');
  doc.setFont(PDF_BRAND.headerFont, 'bold');
  doc.text('Filters', bounds.left + 2, y + 1.5);
  doc.setFont(PDF_BRAND.headerFont, 'normal');
  doc.text(filterLines, bounds.left + 2, y + 6);
  y += filterHeight + 5;
  drawDivider(doc, bounds, y);
  y += 5;

  const drawTableHeader = () => {
    const headerHeight = 11;
    addPageIfNeeded(headerHeight + 6);
    doc.setFillColor(PDF_BRAND.accentColor);
    doc.setDrawColor(PDF_BRAND.accentColor);
    doc.rect(bounds.left - 1, y - 3, bounds.width + 2, headerHeight + 3, 'FD');
    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);

    let x = bounds.left;
    columns.forEach((col) => {
      const colWidth = bounds.width * col.width;
      const labelLines = doc.splitTextToSize(col.label, colWidth - 4);
      doc.text(labelLines, x + 2, y + 4);
      x += colWidth;
    });

    doc.setTextColor(PDF_BRAND.textColor);
    y += headerHeight;
  };

  const renderRow = (entry, index) => {
    const cells = {
      student: `${index + 1}. ${entry.studentName || 'Student'}\nID: ${entry.studentId || '—'}`,
      class: `${entry.class || '—'}${entry.section ? `-${entry.section}` : ''}\n${entry.session || ''}`.trim(),
      cycle: `${entry.cycle || '—'}\n${entry.term || '—'}`,
      status: `${entry.statusLabel || '—'}\n${entry.hasReminder ? 'Reminder sent' : 'No reminder'}`,
      amount: `${formatCurrency(entry.amount)}\nBal: ${formatCurrency(entry.balance)}`,
      dates: `${formatDate(entry.dueDate)}\nPaid: ${formatDate(entry.paidDate)}`,
      mode: `${entry.paymentModeLabel || '—'}\n${entry.transactionId || '—'}`,
    };

    const cellLines = columns.map((col) => doc.splitTextToSize(cells[col.key] || '—', bounds.width * col.width - 4));
    const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * 4.6 + 6;
    addPageIfNeeded(rowHeight + 3, true);

    const stripe = index % 2 === 1;
    if (stripe) {
      doc.setFillColor(PDF_BRAND.softAccent);
      doc.rect(bounds.left - 1, y - 1.5, bounds.width + 2, rowHeight + 3, 'F');
    }

    let x = bounds.left;
    columns.forEach((col, colIndex) => {
      const colWidth = bounds.width * col.width;
      doc.setDrawColor(PDF_BRAND.strokeMuted);
      doc.setLineWidth(0.4);
      doc.rect(x, y, colWidth, rowHeight, 'S');
      doc.setFont(PDF_BRAND.headerFont, 'normal');
      doc.setFontSize(9.5);
      doc.text(cellLines[colIndex], x + 2, y + 5);
      x += colWidth;
    });

    y += rowHeight;
  };

  drawTableHeader();

  if (!entries.length) {
    addPageIfNeeded(12);
    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.setFontSize(11);
    doc.text('No records match the selected filters.', bounds.left, y + 4);
  } else {
    entries.forEach((entry, index) => renderRow(entry, index));
  }

  return doc;
};

const formatDate = (date) => {
  if (date instanceof Date && Number.isFinite(date.getTime())) {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (date?.toDate) {
    const parsed = date.toDate();
    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};
