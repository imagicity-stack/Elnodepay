import { createBrandedDocument } from './base';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const formatDateDisplay = (date) => {
  if (!date) return '—';
  if (date.toDate) {
    return date.toDate().toLocaleString();
  }
  const asDate = new Date(date);
  return Number.isFinite(asDate.getTime())
    ? asDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
};

const ensureSpace = (dimensions, addPage, y, blockHeight) => {
  if (y + blockHeight > dimensions.pageHeight - dimensions.marginBottom) {
    addPage();
    return dimensions.contentStartY;
  }
  return y;
};

const addPaymentCard = (doc, dimensions, addPage, y, payment, index) => {
  const cardPadding = 6;
  let cursorY = ensureSpace(dimensions, addPage, y, 52);
  const { marginLeft, contentWidth } = dimensions;
  doc.setFillColor(252, 248, 244);
  doc.setDrawColor(233, 216, 189);
  doc.roundedRect(marginLeft, cursorY, contentWidth, 52, 3, 3, 'FD');
  cursorY += cardPadding + 1;

  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text(`Payment ${index + 1}`, marginLeft + cardPadding, cursorY);
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  cursorY += 7;
  doc.text(`Amount: ${formatCurrency(payment.amount)}`, marginLeft + cardPadding, cursorY);
  doc.text(`Mode: ${payment.mode || 'Online'}`, marginLeft + contentWidth / 2, cursorY);
  cursorY += 6;
  doc.text(`Date: ${formatDateDisplay(payment.date)}`, marginLeft + cardPadding, cursorY);
  if (payment.transaction_id) {
    doc.text(`Txn: ${payment.transaction_id}`, marginLeft + contentWidth / 2, cursorY);
  }
  cursorY += 8;

  if (payment.breakdown && Array.isArray(payment.breakdown) && payment.breakdown.length > 0) {
    doc.setFont('times', 'bold');
    doc.text('Breakdown', marginLeft + cardPadding, cursorY);
    cursorY += 6;
    doc.setFont('times', 'normal');
    payment.breakdown.forEach((item) => {
      cursorY = ensureSpace(dimensions, addPage, cursorY, 10);
      doc.text(`• ${item.label || 'Fee'} — ${formatCurrency(item.amount)}`, marginLeft + cardPadding + 2, cursorY);
      cursorY += 5;
    });
    cursorY += 4;
  }

  return cursorY + 2;
};

const generateFeeHistoryReportPdf = async ({ student, entries }) => {
  const { doc, dimensions, addPageWithBranding } = await createBrandedDocument();
  const { marginLeft } = dimensions;
  let y = dimensions.contentStartY;

  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text(`Fee Report · ${student.name || student.studentId || 'Student'}`, marginLeft, y);
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.text(`Student ID: ${student.studentId || student.id || '—'}`, marginLeft, (y += 7));
  doc.text(`Class: ${student.class || '-'}`, marginLeft, (y += 6));
  doc.text(`Generated on: ${new Date().toLocaleString()}`, marginLeft, (y += 6));
  y += 4;

  if (!entries.length) {
    doc.text('No payments recorded yet.', marginLeft, y + 6);
    doc.save('fee-history.pdf');
    return;
  }

  entries.forEach((payment, index) => {
    y = addPaymentCard(doc, dimensions, addPageWithBranding, y, payment, index);
  });

  const fileSafeId = `${student.studentId || student.id || 'student'}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  doc.save(`fee-report-${fileSafeId}.pdf`);
};

export { generateFeeHistoryReportPdf };
