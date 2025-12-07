import { createBrandedPdf, drawDivider, drawSectionHeading, formatCurrency, PDF_BRAND } from './branding';

const formatDate = (date) => {
  if (date?.toDate) {
    const parsed = date.toDate();
    return parsed.toLocaleString('en-IN');
  }
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isFinite(parsed?.getTime()) ? parsed.toLocaleString('en-IN') : '—';
};

export const createFeeHistoryReportPdf = (
  jsPDFConstructor,
  { student, entries, durationLabel = 'Full history' },
) => {
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

  const title = `${student?.name || student?.studentId || 'Student'} · Fee History`;

  drawSectionHeading(doc, { ...bounds, startY: y }, 'Fee History Report', student?.school || 'Elden Heights School');
  y += 12;

  doc.setFont(PDF_BRAND.headerFont, 'bold');
  doc.setFontSize(11.5);
  doc.text(title, bounds.left, y);
  y += 4;

  doc.setFillColor(PDF_BRAND.softAccent);
  doc.setDrawColor(PDF_BRAND.strokeMuted);
  const studentBlockHeight = 26;
  doc.roundedRect(bounds.left - 1, y - 4, bounds.width + 2, studentBlockHeight, 2, 2, 'FD');

  const studentId = student?.studentId || student?.id || '—';
  const labelRows = [
    [`Name`, `${student?.name || 'Student'}`],
    [`School Number`, studentId],
    [`Class`, student?.class || '—'],
    [`Session`, student?.session || '—'],
    [`Generated on`, new Date().toLocaleString('en-IN')],
    [`Duration of the report`, durationLabel],
  ];

  const leftColumnX = bounds.left + 2;
  const rightColumnX = bounds.left + bounds.width / 2 + 2;

  doc.setFontSize(9.8);
  labelRows.slice(0, 3).forEach(([label, value], index) => {
    const offsetY = y + 2 + index * 6;
    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.text(`${label}:`, leftColumnX, offsetY);
    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.text(value, leftColumnX + 28, offsetY);
  });

  labelRows.slice(3).forEach(([label, value], index) => {
    const offsetY = y + 2 + index * 6;
    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.text(`${label}:`, rightColumnX, offsetY);
    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.text(value, rightColumnX + 32, offsetY);
  });

  y += studentBlockHeight + 4;
  drawDivider(doc, bounds, y);
  y += 4;

  const columns = [
    { key: 'label', label: 'Payment Number', width: 0.12 },
    { key: 'amount', label: 'Amount', width: 0.16 },
    { key: 'mode', label: 'Mode', width: 0.14 },
    { key: 'dates', label: 'Date and Time', width: 0.2 },
    { key: 'transaction', label: 'Transaction ID', width: 0.18 },
    { key: 'breakdown', label: 'Breakdown', width: 0.2 },
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
    const breakdownItems = (payment.breakdown || []).map((item) => ({
      label: item.label || 'Fee',
      amount: formatCurrency(item.amount),
    }));

    const modeLabel = payment.mode || 'Online';
    const transactionValue = modeLabel.toLowerCase() === 'cash' ? 'NA' : payment.transaction_id || '—';

    const cells = {
      label: `#${index + 1}`,
      amount: formatCurrency(payment.amount),
      mode: modeLabel,
      dates: formatDate(payment.date),
      transaction: transactionValue,
      breakdown: breakdownItems,
    };

    const cellLines = columns.map((col) =>
      col.key === 'breakdown'
        ? []
        : doc.splitTextToSize(cells[col.key] || '—', bounds.width * col.width - 4),
    );
    const textHeights = cellLines
      .filter((lines) => lines.length)
      .map((lines) => lines.length * 4.6 + 6);
    const breakdownHeight = Math.max(1, breakdownItems.length) * 5.2 + 4;
    const rowHeight = Math.max(...textHeights, breakdownHeight);
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
      doc.setFontSize(9.4);

      if (col.key === 'breakdown') {
        let lineY = y + 5;
        if (!breakdownItems.length) {
          doc.text('—', x + 2, lineY);
        } else {
          breakdownItems.forEach((item) => {
            doc.setFont(PDF_BRAND.headerFont, 'bold');
            doc.text(item.label, x + 2, lineY);
            doc.setFont(PDF_BRAND.headerFont, 'normal');
            doc.text(item.amount, x + width - 2, lineY, { align: 'right' });
            lineY += 5.2;
          });
        }
      } else {
        doc.text(cellLines[colIndex], x + 2, y + 5);
      }
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
