import { createBrandedPdf, drawDivider, drawSectionHeading, formatCurrency, PDF_BRAND } from './branding';

const formatDate = (date) => {
  if (date?.toDate) {
    const parsed = date.toDate();
    return parsed.toLocaleString('en-IN');
  }
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isFinite(parsed?.getTime()) ? parsed.toLocaleString('en-IN') : '—';
};

export const createFeeHistoryReportPdf = (jsPDFConstructor, { student, entries }) => {
  const { doc, contentBounds, addBrandedPage } = createBrandedPdf(jsPDFConstructor);
  let bounds = contentBounds;
  let y = bounds.startY;

  const addPageIfNeeded = (space = 12, withHeader = false) => {
    if (y + space > bounds.maxY) {
      bounds = addBrandedPage();
      y = bounds.startY;
      if (withHeader) {
        drawTableHeader();
      }
    }
  };

  const title = `Fee Report · ${student?.name || student?.studentId || 'Student'}`;

  drawSectionHeading(doc, { ...bounds, startY: y }, title, student?.school || 'Elden Heights School');
  y += 13;

  doc.setFillColor(PDF_BRAND.softAccent);
  doc.setDrawColor(PDF_BRAND.strokeMuted);
  const studentBlockHeight = 16;
  doc.roundedRect(bounds.left - 1, y - 4, bounds.width + 2, studentBlockHeight, 2, 2, 'FD');

  doc.setFont(PDF_BRAND.headerFont, 'bold');
  doc.setFontSize(11);
  const studentId = student?.studentId || student?.id || '—';
  doc.text(`${student?.name || 'Student'} (${studentId})`, bounds.left + 2, y + 1);
  doc.setFont(PDF_BRAND.headerFont, 'normal');
  doc.setFontSize(10);
  doc.text(`Class: ${student?.class || '—'}`, bounds.left + bounds.width / 2, y + 1);
  doc.text(`Generated: ${new Date().toLocaleString()}`, bounds.left + 2, y + 7);
  doc.text(`Session: ${student?.session || '—'}`, bounds.left + bounds.width / 2, y + 7);
  y += studentBlockHeight + 3;
  drawDivider(doc, bounds, y);
  y += 5;

  const columns = [
    { key: 'label', label: 'Payment', width: 0.16 },
    { key: 'amount', label: 'Amount', width: 0.14 },
    { key: 'mode', label: 'Mode', width: 0.14 },
    { key: 'dates', label: 'Date / Time', width: 0.2 },
    { key: 'transaction', label: 'Transaction ID', width: 0.18 },
    { key: 'breakdown', label: 'Breakdown', width: 0.18 },
  ];

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
      const width = bounds.width * col.width;
      const labelLines = doc.splitTextToSize(col.label, width - 4);
      doc.text(labelLines, x + 2, y + 4);
      x += width;
    });

    doc.setTextColor(PDF_BRAND.textColor);
    y += headerHeight;
  };

  const renderRow = (payment, index) => {
    const breakdownLines = (payment.breakdown || [])
      .map((item) => `${item.label || 'Fee'}: ${formatCurrency(item.amount)}`)
      .join('\n');

    const cells = {
      label: `#${index + 1}`,
      amount: formatCurrency(payment.amount),
      mode: payment.mode || 'Online',
      dates: formatDate(payment.date),
      transaction: payment.transaction_id || '—',
      breakdown: breakdownLines || '—',
    };

    const cellLines = columns.map((col) => doc.splitTextToSize(cells[col.key] || '—', bounds.width * col.width - 4));
    const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * 4.6 + 6;
    addPageIfNeeded(rowHeight + 3, true);

    if (index % 2 === 1) {
      doc.setFillColor(PDF_BRAND.softAccent);
      doc.rect(bounds.left - 1, y - 1.5, bounds.width + 2, rowHeight + 3, 'F');
    }

    let x = bounds.left;
    columns.forEach((col, colIndex) => {
      const width = bounds.width * col.width;
      doc.setDrawColor(PDF_BRAND.strokeMuted);
      doc.setLineWidth(0.4);
      doc.rect(x, y, width, rowHeight, 'S');
      doc.setFont(PDF_BRAND.headerFont, 'normal');
      doc.setFontSize(9.5);
      doc.text(cellLines[colIndex], x + 2, y + 5);
      x += width;
    });

    y += rowHeight;
  };

  drawTableHeader();

  if (!entries.length) {
    addPageIfNeeded(12);
    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.setFontSize(11);
    doc.text('No payments recorded yet.', bounds.left, y + 4);
  } else {
    entries.forEach((payment, index) => {
      renderRow(payment, index);
    });
  }

  return doc;
};
