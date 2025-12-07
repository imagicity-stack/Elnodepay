import { jsPDF } from 'jspdf';

const HEADER_HEIGHT_MM = 50.8; // 2 inches
const FOOTER_HEIGHT_MM = 25.4; // 1 inch
const SIDE_MARGIN_MM = 38.1; // 1.5 inches
const BOTTOM_MARGIN_MM = 38.1; // 1.5 inches
const CONTENT_TOP_GAP_MM = 12.7; // 0.5 inch below header
const FOOTER_COLOR = [140, 25, 27]; // #8c191b

const formatAmount = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const parseDate = (value) => {
  if (!value) return null;
  if (value.toDate) {
    const parsed = value.toDate();
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const formatDateTime = (value) => {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleString('en-IN') : '—';
};

const drawHeader = (doc, pageWidth) => {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT_MM, 'F');
  doc.setFont('times', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(24);
  doc.text('The Elden Heights SchooL', pageWidth / 2, HEADER_HEIGHT_MM / 2 + 6, {
    align: 'center',
  });
};

const drawFooter = (doc, pageWidth, pageHeight) => {
  doc.setFillColor(...FOOTER_COLOR);
  doc.rect(0, pageHeight - FOOTER_HEIGHT_MM, pageWidth, FOOTER_HEIGHT_MM, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(
    ' The Elden Heights School | A unit of Bhagwati Educational And Charitable Trust | Opposite B.S.F Firing Range, Siwar, Hazaribagh 825317 ,Contact: +91 9431904333 | www.eldenheights.org ',
    pageWidth / 2,
    pageHeight - FOOTER_HEIGHT_MM / 2 + 2,
    { align: 'center', maxWidth: pageWidth - 12 },
  );
  doc.setTextColor(0, 0, 0);
};

const ensureSpace = (doc, cursor, neededHeight) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxContentY = pageHeight - BOTTOM_MARGIN_MM;
  if (cursor + neededHeight <= maxContentY) {
    return cursor;
  }
  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  drawHeader(doc, pageWidth);
  drawFooter(doc, pageWidth, pageHeight);
  return HEADER_HEIGHT_MM + CONTENT_TOP_GAP_MM;
};

export const generateStudentPaymentHistoryPDF = async ({
  student,
  payments = [],
  filters = {},
  durationLabel,
}) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 2 * SIDE_MARGIN_MM;

  drawHeader(doc, pageWidth);
  drawFooter(doc, pageWidth, pageHeight);

  let cursorY = HEADER_HEIGHT_MM + CONTENT_TOP_GAP_MM;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Fee History Report', SIDE_MARGIN_MM, cursorY);
  cursorY += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const infoBlockHeight = 8 * 6; // six lines with padding
  doc.setFillColor(248, 250, 252);
  doc.rect(SIDE_MARGIN_MM, cursorY - 6, contentWidth, infoBlockHeight, 'F');

  const details = [
    ['Name', student?.name || '—'],
    ['School Number', student?.studentId || student?.id || '—'],
    ['Class', student?.class || '—'],
    ['Session', student?.session || filters.session || '—'],
    ['Generated on', new Date().toLocaleString('en-IN')],
    ['Duration of the report', durationLabel || 'Complete history'],
  ];

  details.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, SIDE_MARGIN_MM + 2, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), SIDE_MARGIN_MM + 38, cursorY);
    cursorY += 6;
  });

  cursorY += 4;

  const columns = [
    { label: 'Payment Number', width: 14 },
    { label: 'Amount', width: 22 },
    { label: 'Mode', width: 16 },
    { label: 'Date and Time', width: 32 },
    { label: 'Transaction Id', width: 20 },
    { label: 'Breakdown', width: contentWidth - 104 },
  ];

  const headerY = ensureSpace(doc, cursorY, 10);
  cursorY = headerY;
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(241, 245, 249);
  doc.rect(SIDE_MARGIN_MM, cursorY - 5, contentWidth, 10, 'F');
  let cursorX = SIDE_MARGIN_MM;
  columns.forEach((column) => {
    doc.text(column.label, cursorX + 2, cursorY + 1);
    cursorX += column.width;
  });
  doc.setFont('helvetica', 'normal');
  cursorY += 8;

  const sortedPayments = [...payments].sort((a, b) => {
    const dateA = parseDate(a?.date)?.getTime() || 0;
    const dateB = parseDate(b?.date)?.getTime() || 0;
    return dateB - dateA;
  });

  if (!sortedPayments.length) {
    doc.text('No payments recorded yet for the selected filters.', SIDE_MARGIN_MM, cursorY + 4);
  }

  sortedPayments.forEach((payment, index) => {
    const modeLabel = payment.mode || 'Online';
    const transactionId = modeLabel.toLowerCase() === 'cash'
      ? 'NA'
      : payment.transaction_id || payment.razorpay_payment_id || '—';
    const breakdownItems = Array.isArray(payment.breakdown) ? payment.breakdown : [];
    const breakdownLines = breakdownItems.length
      ? breakdownItems.map((item) => `${item.label || 'Fee'}: ${formatAmount(item.amount)}`)
      : ['—'];
    const dateLabel = formatDateTime(payment.date || payment.parsedDate);

    const lineHeights = [
      6,
      6,
      6,
      6,
      doc.splitTextToSize(transactionId, columns[4].width - 4).length * 5,
      breakdownLines.reduce((height, line) => {
        const splits = doc.splitTextToSize(line, columns[5].width - 4);
        return height + splits.length * 5;
      }, 0) || 6,
    ];

    const rowHeight = Math.max(...lineHeights, 14);
    cursorY = ensureSpace(doc, cursorY, rowHeight + 4);

    cursorX = SIDE_MARGIN_MM;
    doc.text(String(index + 1), cursorX + 2, cursorY);
    cursorX += columns[0].width;

    doc.text(formatAmount(payment.amount), cursorX + 2, cursorY);
    cursorX += columns[1].width;

    doc.text(modeLabel, cursorX + 2, cursorY);
    cursorX += columns[2].width;

    doc.text(doc.splitTextToSize(dateLabel, columns[3].width - 4), cursorX + 2, cursorY, {
      maxWidth: columns[3].width - 4,
    });
    cursorX += columns[3].width;

    doc.text(
      doc.splitTextToSize(transactionId, columns[4].width - 4),
      cursorX + 2,
      cursorY,
      { maxWidth: columns[4].width - 4 },
    );
    cursorX += columns[4].width;

    const breakdownY = cursorY;
    breakdownLines.forEach((line) => {
      const splitLines = doc.splitTextToSize(line, columns[5].width - 4);
      splitLines.forEach((textLine, idx) => {
        const yPosition = breakdownY + idx * 5;
        const [labelPart, amountPart] = textLine.split(':');
        doc.setFont('helvetica', 'bold');
        doc.text(`${labelPart || textLine}:`, cursorX + 2, yPosition);
        if (amountPart) {
          doc.setFont('helvetica', 'normal');
          doc.text(amountPart.trim(), cursorX + 2 + doc.getTextWidth(`${labelPart || ''}: `), yPosition);
        }
        doc.setFont('helvetica', 'normal');
      });
    });

    cursorY += rowHeight + 4;
  });

  const fileSafeId = `${student?.studentId || student?.id || 'student'}`
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase();
  doc.save(`student-payment-history-${fileSafeId}.pdf`);
};
