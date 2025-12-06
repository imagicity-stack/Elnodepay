import { createBrandedPdf, drawDivider, drawSectionHeading, formatCurrency, PDF_BRAND } from './branding';

export const createFeeCollectionReportPdf = (jsPDFConstructor, { entries = [], summaryText = '', schoolName }) => {
  const { doc, contentBounds, addBrandedPage } = createBrandedPdf(jsPDFConstructor);
  let bounds = contentBounds;
  let y = bounds.startY;

  const maxY = () => bounds.maxY;

  const addPageIfNeeded = (space = 12) => {
    if (y + space > maxY()) {
      bounds = addBrandedPage();
      y = bounds.startY;
    }
  };

  drawSectionHeading(doc, { ...bounds, startY: y }, 'Fee Collection Report', schoolName || 'Elden Heights School');
  y += 14;

  doc.setFont(PDF_BRAND.headerFont, 'normal');
  doc.setFontSize(10.5);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, bounds.left, y);
  y += 7;

  doc.setFillColor(PDF_BRAND.softAccent);
  doc.setDrawColor(PDF_BRAND.strokeMuted);
  const filterHeight = 14;
  doc.roundedRect(bounds.left - 1, y - 5, bounds.width + 2, filterHeight, 2, 2, 'FD');
  doc.setFont(PDF_BRAND.headerFont, 'bold');
  doc.text('Filters', bounds.left + 2, y);
  doc.setFont(PDF_BRAND.headerFont, 'normal');
  const filterLines = doc.splitTextToSize(summaryText || 'No filters applied', bounds.width - 10);
  doc.text(filterLines, bounds.left + 2, y + 5);
  y += filterHeight + (filterLines.length > 1 ? (filterLines.length - 1) * 4 : 2) + 2;
  drawDivider(doc, bounds, y);
  y += 6;

  entries.forEach((entry, index) => {
    const expectedHeight = 52;
    addPageIfNeeded(expectedHeight + 12);

    const cardTop = y;
    const cardPadding = 5;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(PDF_BRAND.strokeMuted);
    doc.setLineWidth(0.6);
    doc.roundedRect(bounds.left - 1.5, cardTop - 3, bounds.width + 3, expectedHeight, 2.5, 2.5, 'FD');

    doc.setFillColor(PDF_BRAND.accentColor);
    doc.setDrawColor(PDF_BRAND.accentColor);
    doc.roundedRect(bounds.left - 1.5, cardTop - 3, 4, expectedHeight, 2, 2, 'F');

    let cursorY = cardTop + cardPadding;
    doc.setTextColor(20, 20, 20);
    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.setFontSize(12);
    doc.text(`${index + 1}. ${entry.studentName || 'Student'}`, bounds.left + 4, cursorY);
    cursorY += 6;

    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.setFontSize(10);
    doc.text(`Student ID: ${entry.studentId || '—'}`, bounds.left + 4, cursorY);
    doc.text(
      `Class: ${entry.class || '—'}${entry.section ? ` · Section ${entry.section}` : ''}`,
      bounds.left + bounds.width / 2,
      cursorY,
    );
    cursorY += 6;

    doc.text(`Status: ${entry.statusLabel || '—'} · Cycle: ${entry.cycle || '—'}`, bounds.left + 4, cursorY);
    doc.text(`Session: ${entry.session || '—'} · Term: ${entry.term || '—'}`, bounds.left + bounds.width / 2, cursorY);
    cursorY += 6;

    const amountLine = `Amount: ${formatCurrency(entry.amount)} · Balance: ${formatCurrency(entry.balance)}`;
    doc.text(amountLine, bounds.left + 4, cursorY);
    const dateLine = `Due: ${formatDate(entry.dueDate)} · Paid: ${formatDate(entry.paidDate)}`;
    doc.text(dateLine, bounds.left + bounds.width / 2, cursorY);
    cursorY += 6;

    const modeLine = `Mode: ${entry.paymentModeLabel || '—'} · Txn: ${entry.transactionId || '—'}`;
    doc.text(modeLine, bounds.left + 4, cursorY);
    const parentLine = `Parent: ${entry.parentEmail || '—'} · Phone: ${entry.parentPhone || '—'}`;
    doc.text(parentLine, bounds.left + bounds.width / 2, cursorY);
    cursorY += 6;

    const reminderLine = `Reminder Sent: ${entry.hasReminder ? 'Yes' : 'No'} · Store Charge: ${formatCurrency(entry.storeAmount)}`;
    doc.text(reminderLine, bounds.left + 4, cursorY);
    cursorY += 10;

    drawDivider(doc, bounds, cursorY - 2, PDF_BRAND.strokeMuted);
    y = cursorY + 4;
  });

  if (!entries.length) {
    addPageIfNeeded(12);
    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.setFontSize(11);
    doc.text('No records match the selected filters.', bounds.left, y);
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
