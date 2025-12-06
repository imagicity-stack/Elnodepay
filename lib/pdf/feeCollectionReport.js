import { createBrandedPdf, formatCurrency, PDF_BRAND } from './branding';

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

  doc.setFont(PDF_BRAND.headerFont, 'bold');
  doc.setFontSize(17);
  doc.text('Fee Collection Report', bounds.left, y);
  y += 8;

  doc.setFont(PDF_BRAND.headerFont, 'normal');
  doc.setFontSize(11);
  if (schoolName) {
    doc.text(schoolName, bounds.left, y);
    y += 6;
  }
  doc.text(`Generated on: ${new Date().toLocaleString()}`, bounds.left, y);
  y += 6;

  doc.setFontSize(10);
  const filterLines = doc.splitTextToSize(`Filters: ${summaryText || 'No filters applied'}`, bounds.width);
  doc.text(filterLines, bounds.left, y);
  y += filterLines.length * 5 + 6;

  entries.forEach((entry, index) => {
    addPageIfNeeded(30);

    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.setFontSize(12);
    doc.text(`${index + 1}. ${entry.studentName || 'Student'}`, bounds.left, y);
    y += 6;

    doc.setFont(PDF_BRAND.headerFont, 'normal');
    doc.setFontSize(10);
    doc.text(`Student ID: ${entry.studentId || '—'}`, bounds.left, y);
    doc.text(`Class: ${entry.class || '—'}${entry.section ? ` · Section ${entry.section}` : ''}`, bounds.left + bounds.width / 2, y);
    y += 6;

    doc.text(`Status: ${entry.statusLabel || '—'} · Cycle: ${entry.cycle || '—'}`, bounds.left, y);
    doc.text(`Session: ${entry.session || '—'} · Term: ${entry.term || '—'}`, bounds.left + bounds.width / 2, y);
    y += 6;

    const amountLine = `Amount: ${formatCurrency(entry.amount)} · Balance: ${formatCurrency(entry.balance)}`;
    doc.text(amountLine, bounds.left, y);
    const dateLine = `Due: ${formatDate(entry.dueDate)} · Paid: ${formatDate(entry.paidDate)}`;
    doc.text(dateLine, bounds.left + bounds.width / 2, y);
    y += 6;

    const modeLine = `Mode: ${entry.paymentModeLabel || '—'} · Txn: ${entry.transactionId || '—'}`;
    doc.text(modeLine, bounds.left, y);
    const parentLine = `Parent: ${entry.parentEmail || '—'} · Phone: ${entry.parentPhone || '—'}`;
    doc.text(parentLine, bounds.left + bounds.width / 2, y);
    y += 6;

    const reminderLine = `Reminder Sent: ${entry.hasReminder ? 'Yes' : 'No'} · Store Charge: ${formatCurrency(entry.storeAmount)}`;
    doc.text(reminderLine, bounds.left, y);
    y += 8;

    doc.setDrawColor(226, 232, 240);
    doc.line(bounds.left, y, bounds.right, y);
    y += 6;
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
