import {
  buildBaseSchema,
  buildFooterBarSvg,
  FOOTER_TEXT,
  getLinesPerPage,
  paginateLines,
  wrapText,
} from './shared';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDateDisplay = (date) => {
  if (date instanceof Date && Number.isFinite(date.getTime())) {
    return date.toLocaleString('en-IN');
  }
  const parsed = date?.toDate ? date.toDate() : date ? new Date(date) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('en-IN') : '—';
};

const buildPaymentLines = (entries = []) => {
  if (!entries.length) return ['No payments recorded yet.'];
  const lines = [];
  entries.forEach((payment, index) => {
    lines.push(...wrapText(`Payment ${index + 1}`));
    lines.push(...wrapText(`Amount: ${formatCurrency(payment.amount)} | Mode: ${payment.mode || 'Online'}`));
    lines.push(...wrapText(`Date: ${formatDateDisplay(payment.date)}`));
    if (payment.transaction_id) {
      lines.push(...wrapText(`Transaction ID: ${payment.transaction_id}`));
    }
    if (payment.breakdown && Array.isArray(payment.breakdown) && payment.breakdown.length > 0) {
      lines.push(...wrapText('Breakdown:'));
      payment.breakdown.forEach((item) => {
        lines.push(...wrapText(`• ${item.label || 'Fee'} — ${formatCurrency(item.amount)}`));
      });
    }
    lines.push('');
  });
  return lines;
};

export const generateFeeHistoryReportPdf = async ({ entries = [], student = {}, schoolName }) => {
  const { BLANK_PDF, generate } = await import('pdfme');
  const schema = buildBaseSchema();
  const footerBarSvg = buildFooterBarSvg();
  const introLines = [
    schoolName || 'The Elden Heights School',
    `Fee Report for ${student.name || student.studentId || 'Student'}`,
    `Student ID: ${student.studentId || student.id || '—'}`,
    `Class: ${student.class || '—'}`,
  ];
  const introText = introLines
    .map((line) => wrapText(line, 110).join('\n'))
    .join('\n');
  const bodyLines = buildPaymentLines(entries);
  const linesPerPage = getLinesPerPage();
  const pagedLines = paginateLines(bodyLines, linesPerPage);
  const schemas = pagedLines.map(() => JSON.parse(JSON.stringify(schema)));
  const inputs = pagedLines.map((pageLines) => ({
    headerTitle: 'The Elden Heights SchooL',
    headerSubtitle: 'Payment History',
    intro: introText,
    body: pageLines.join('\n'),
    footerBar: footerBarSvg,
    footerText: FOOTER_TEXT,
  }));

  return generate({
    template: {
      basePdf: BLANK_PDF,
      schemas,
    },
    inputs,
  });
};
