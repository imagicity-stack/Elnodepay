import { createBrandedDocument } from './base';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const formatDateDisplay = (date) =>
  date instanceof Date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const ensureSpace = (dimensions, addPage, y, blockHeight) => {
  if (y + blockHeight > dimensions.pageHeight - dimensions.marginBottom) {
    addPage();
    return dimensions.contentStartY;
  }
  return y;
};

const addEntryCard = (doc, dimensions, addPage, y, entry, index) => {
  const cardPadding = 6;
  let cursorY = ensureSpace(dimensions, addPage, y, 56);
  const { marginLeft, contentWidth } = dimensions;
  doc.setFillColor(248, 249, 252);
  doc.setDrawColor(222, 226, 230);
  doc.roundedRect(marginLeft, cursorY, contentWidth, 56, 3, 3, 'FD');
  cursorY += cardPadding + 2;

  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text(`${index + 1}. ${entry.studentName || 'Student'}`, marginLeft + cardPadding, cursorY);
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  const statusLine = `Status: ${entry.statusLabel || '—'} · Cycle: ${entry.cycle || '—'}`;
  const sessionLine = `Session: ${entry.session || '—'} · Term: ${entry.term || '—'}`;
  const classLine = `Class: ${entry.class || '—'}${entry.section ? ` · Section ${entry.section}` : ''}`;
  cursorY += 7;
  doc.text(classLine, marginLeft + cardPadding, cursorY);
  doc.text(`Student ID: ${entry.studentId || '—'}`, marginLeft + contentWidth / 2, cursorY);
  cursorY += 6;
  doc.text(statusLine, marginLeft + cardPadding, cursorY);
  doc.text(sessionLine, marginLeft + contentWidth / 2, cursorY);
  cursorY += 6;
  doc.text(`Amount: ${formatCurrency(entry.amount)} · Balance: ${formatCurrency(entry.balance)}`, marginLeft + cardPadding, cursorY);
  doc.text(
    `Due: ${formatDateDisplay(entry.dueDate)} · Paid: ${formatDateDisplay(entry.paidDate)}`,
    marginLeft + contentWidth / 2,
    cursorY,
  );
  cursorY += 6;
  doc.text(`Mode: ${entry.paymentModeLabel || '—'} · Txn: ${entry.transactionId || '—'}`, marginLeft + cardPadding, cursorY);
  cursorY += 6;
  doc.text(
    `Parent: ${entry.parentEmail || '—'} · Phone: ${entry.parentPhone || '—'}`,
    marginLeft + cardPadding,
    cursorY,
  );
  cursorY += 6;
  doc.text(
    `Reminder: ${entry.hasReminder ? 'Sent' : 'Not sent'} · Store Charge: ${formatCurrency(entry.storeAmount)}`,
    marginLeft + cardPadding,
    cursorY,
  );
  cursorY += 10;
  return cursorY;
};

const generateFeeCollectionReportPdf = async ({ entries, summaryText }) => {
  const { doc, dimensions, addPageWithBranding } = await createBrandedDocument();
  const { marginLeft, contentWidth } = dimensions;
  let y = dimensions.contentStartY;

  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('Fee Collection Report', marginLeft, y);
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, marginLeft, (y += 7));
  const filtersLines = doc.splitTextToSize(`Filters: ${summaryText}`, contentWidth);
  doc.text(filtersLines, marginLeft, (y += 7));
  y += 6;

  entries.forEach((entry, index) => {
    y = addEntryCard(doc, dimensions, addPageWithBranding, y, entry, index);
  });

  doc.save('fee-collection-report.pdf');
};

export { generateFeeCollectionReportPdf };
