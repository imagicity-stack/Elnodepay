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

  const addPageIfNeeded = (space = 12) => {
    if (y + space > bounds.maxY) {
      bounds = addBrandedPage();
      y = bounds.startY;
    }
  };

  const title = `Fee Report · ${student?.name || student?.studentId || 'Student'}`;

  drawSectionHeading(doc, { ...bounds, startY: y }, title, student?.school || 'Elden Heights School');
  y += 14;

  doc.setFillColor(PDF_BRAND.softAccent);
  doc.setDrawColor(PDF_BRAND.strokeMuted);
  const studentBlockHeight = 18;
  doc.roundedRect(bounds.left - 1, y - 5, bounds.width + 2, studentBlockHeight, 2, 2, 'FD');

  doc.setFont(PDF_BRAND.headerFont, 'bold');
  doc.setFontSize(11);
  const studentId = student?.studentId || student?.id || '—';
  doc.text(`Student ID: ${studentId}`, bounds.left + 2, y);
  doc.text(`Class: ${student?.class || '—'}`, bounds.left + bounds.width / 2, y);
  doc.setFont(PDF_BRAND.headerFont, 'normal');
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, bounds.left + 2, y + 6);
  if (student?.session) {
    doc.text(`Session: ${student.session}`, bounds.left + bounds.width / 2, y + 6);
  }
  y += studentBlockHeight + 4;
  drawDivider(doc, bounds, y);
  y += 6;

  if (!entries.length) {
    doc.text('No payments recorded yet.', bounds.left, y);
    return doc;
  }

  entries.forEach((payment, index) => {
    const cardHeight = 38 + (payment.breakdown?.length || 0) * 6;
    addPageIfNeeded(cardHeight + 10);

    const cardTop = y;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(PDF_BRAND.strokeMuted);
    doc.setLineWidth(0.6);
    doc.roundedRect(bounds.left - 1.5, cardTop - 3, bounds.width + 3, cardHeight, 2.5, 2.5, 'FD');

    doc.setFillColor(PDF_BRAND.accentColor);
    doc.rect(bounds.left - 1.5, cardTop - 3, 4, cardHeight, 'F');

    let cursorY = cardTop + 4;
    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.setFontSize(12);
    doc.text(`Payment ${index + 1}`, bounds.left + 4, cursorY);
    cursorY += 7;

    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.setFontSize(10);
    doc.text(`Amount: ${formatCurrency(payment.amount)}`, bounds.left + 4, cursorY);
    doc.text(`Mode: ${payment.mode || 'Online'}`, bounds.left + bounds.width / 2, cursorY);
    cursorY += 6;

    doc.text(`Date: ${formatDate(payment.date)}`, bounds.left + 4, cursorY);
    if (payment.transaction_id) {
      doc.text(`Transaction ID: ${payment.transaction_id}`, bounds.left + bounds.width / 2, cursorY);
    }
    cursorY += 6;

    if (payment.breakdown && Array.isArray(payment.breakdown) && payment.breakdown.length > 0) {
      doc.setFont(PDF_BRAND.headerFont, 'bold');
      doc.text('Breakdown', bounds.left + 4, cursorY);
      doc.setFont(PDF_BRAND.headerFont, 'normal');
      cursorY += 6;

      payment.breakdown.forEach((item) => {
        const line = `• ${item.label || 'Fee'} — ${formatCurrency(item.amount)}`;
        doc.text(line, bounds.left + 6, cursorY);
        cursorY += 6;
        addPageIfNeeded(12);
      });
    }

    drawDivider(doc, bounds, cursorY - 2, PDF_BRAND.strokeMuted);
    y = cursorY + 4;
  });

  return doc;
};
