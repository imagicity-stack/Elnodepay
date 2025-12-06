import { createBrandedPdf, formatCurrency, PDF_BRAND } from './branding';

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

  doc.setFont(PDF_BRAND.headerFont, 'bold');
  doc.setFontSize(16);
  doc.text(title, bounds.left, y);
  y += 8;

  doc.setFont(PDF_BRAND.headerFont, 'normal');
  doc.setFontSize(10);
  const studentId = student?.studentId || student?.id || '—';
  doc.text(`Student ID: ${studentId}`, bounds.left, y);
  doc.text(`Class: ${student?.class || '—'}`, bounds.left + bounds.width / 2, y);
  y += 6;
  doc.text(`Generated on: ${new Date().toLocaleString()}`, bounds.left, y);
  y += 8;

  if (!entries.length) {
    doc.text('No payments recorded yet.', bounds.left, y);
    return doc;
  }

  entries.forEach((payment, index) => {
    addPageIfNeeded(36);

    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.setFontSize(12);
    doc.text(`Payment ${index + 1}`, bounds.left, y);
    y += 6;

    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.setFontSize(10);
    doc.text(`Amount: ${formatCurrency(payment.amount)}`, bounds.left, y);
    doc.text(`Mode: ${payment.mode || 'Online'}`, bounds.left + bounds.width / 2, y);
    y += 6;

    doc.text(`Date: ${formatDate(payment.date)}`, bounds.left, y);
    if (payment.transaction_id) {
      doc.text(`Transaction ID: ${payment.transaction_id}`, bounds.left + bounds.width / 2, y);
    }
    y += 6;

    if (payment.breakdown && Array.isArray(payment.breakdown) && payment.breakdown.length > 0) {
      doc.text('Breakdown:', bounds.left, y);
      y += 6;

      payment.breakdown.forEach((item) => {
        const line = `• ${item.label || 'Fee'} — ${formatCurrency(item.amount)}`;
        doc.text(line, bounds.left + 4, y);
        y += 6;
        addPageIfNeeded(12);
      });
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(bounds.left, y, bounds.right, y);
    y += 6;
  });

  return doc;
};
