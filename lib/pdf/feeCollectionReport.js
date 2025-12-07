import { createBrandedPdf, drawDivider, drawSectionHeading, formatCurrency, PDF_BRAND } from './branding';

export const createFeeCollectionReportPdf = (
  jsPDFConstructor,
  { entries = [], summaryText = '', schoolName, durationLabel },
) => {
  const { doc, contentBounds, addBrandedPage } = createBrandedPdf(jsPDFConstructor);
  let bounds = contentBounds;
  let y = bounds.startY;

  const studentSummaries = entries.reduce((acc, entry) => {
    const id = entry.studentId || entry.student_id || entry.student?.id;
    if (!id) return acc;
    if (!acc[id]) {
      acc[id] = {
        name: entry.studentName || entry.student?.name,
        id,
        classLabel: entry.class || entry.student?.class,
        session: entry.session || entry.student?.session,
      };
    }
    return acc;
  }, {});
  const uniqueStudents = Object.values(studentSummaries);

  const reportContext = {
    name:
      uniqueStudents.length === 1
        ? uniqueStudents[0].name || 'Student'
        : uniqueStudents.length > 1
          ? 'All Students'
          : '—',
    schoolNumber:
      uniqueStudents.length === 1 ? uniqueStudents[0].id || '—' : uniqueStudents.length > 1 ? 'Multiple' : '—',
    classLabel:
      uniqueStudents.length === 1
        ? uniqueStudents[0].classLabel || '—'
        : uniqueStudents.length > 1
          ? 'Multiple'
          : '—',
    session:
      uniqueStudents.length === 1 ? uniqueStudents[0].session || '—' : uniqueStudents.length > 1 ? 'Multiple' : '—',
    generatedOn: new Date().toLocaleString('en-IN'),
    duration: durationLabel || summaryText || 'All time',
  };

  const columns = [
    { key: 'label', label: 'Payment Number', width: 0.12 },
    { key: 'amount', label: 'Amount', width: 0.16 },
    { key: 'mode', label: 'Mode', width: 0.14 },
    { key: 'dates', label: 'Date and Time', width: 0.2 },
    { key: 'transaction', label: 'Transaction ID', width: 0.18 },
    { key: 'breakdown', label: 'Breakdown', width: 0.2 },
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

  drawSectionHeading(doc, { ...bounds, startY: y }, 'Fee History Report', schoolName || 'Elden Heights School');
  y += 12;

  doc.setFont(PDF_BRAND.headerFont, 'bold');
  doc.setFontSize(11.5);
  doc.text('Fee Collection Report', bounds.left, y);
  y += 4;

  doc.setFillColor(PDF_BRAND.softAccent);
  doc.setDrawColor(PDF_BRAND.strokeMuted);
  const infoHeight = 26;
  doc.roundedRect(bounds.left - 1, y - 4, bounds.width + 2, infoHeight, 2, 2, 'FD');

  const infoPairs = [
    ['Name', reportContext.name],
    ['School Number', reportContext.schoolNumber],
    ['Class', reportContext.classLabel],
    ['Session', reportContext.session],
    ['Generated on', reportContext.generatedOn],
    ['Duration of the report', reportContext.duration],
  ];

  const leftX = bounds.left + 2;
  const rightX = bounds.left + bounds.width / 2 + 2;
  doc.setFontSize(9.8);
  infoPairs.slice(0, 3).forEach(([label, value], index) => {
    const offsetY = y + 2 + index * 6;
    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.text(`${label}:`, leftX, offsetY);
    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.text(value, leftX + 28, offsetY);
  });
  infoPairs.slice(3).forEach(([label, value], index) => {
    const offsetY = y + 2 + index * 6;
    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.text(`${label}:`, rightX, offsetY);
    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.text(value, rightX + 32, offsetY);
  });

  y += infoHeight + 4;
  drawDivider(doc, bounds, y);
  y += 4;

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
    const breakdownItems = (entry.breakdown || []).map((item) => ({
      label: item.label || 'Fee',
      amount: formatCurrency(item.amount),
    }));

    const cells = {
      label: `#${index + 1}`,
      amount: formatCurrency(entry.amount),
      mode: entry.paymentModeLabel || entry.paymentMode || '—',
      dates: formatDate(entry.paidDate || entry.date || entry.dueDate),
      transaction: entry.paymentModeLabel?.toLowerCase() === 'cash' ? 'NA' : entry.transactionId || '—',
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
    return date.toLocaleString('en-IN');
  }
  if (date?.toDate) {
    const parsed = date.toDate();
    return parsed.toLocaleString('en-IN');
  }
  return date ? new Date(date).toLocaleString('en-IN') : '—';
};
