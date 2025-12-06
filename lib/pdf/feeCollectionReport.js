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
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const parsed = date?.toDate ? date.toDate() : date ? new Date(date) : null;
  return parsed && Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
};

const buildEntryLines = (entries = []) => {
  if (!entries.length) return ['No records match the selected filters.'];
  const lines = [];
  entries.forEach((entry, index) => {
    lines.push(...wrapText(`${index + 1}. ${entry.studentName || 'Student'}`));
    lines.push(...wrapText(`Student ID: ${entry.studentId || '—'}`));
    lines.push(
      ...wrapText(
        `Class: ${entry.class || '—'}${entry.section ? ` · Section ${entry.section}` : ''} | Status: ${
          entry.statusLabel || '—'
        } | Cycle: ${entry.cycle || '—'}`,
      ),
    );
    lines.push(...wrapText(`Session: ${entry.session || '—'} | Term: ${entry.term || '—'}`));
    lines.push(
      ...wrapText(
        `Amount: ${formatCurrency(entry.amount)} | Balance: ${formatCurrency(entry.balance)} | Due: ${formatDateDisplay(
          entry.dueDate,
        )} | Paid: ${formatDateDisplay(entry.paidDate)}`,
      ),
    );
    lines.push(
      ...wrapText(
        `Mode: ${entry.paymentModeLabel || '—'} | Txn: ${entry.transactionId || '—'} | Store Charge: ${formatCurrency(
          entry.storeAmount,
        )}`,
      ),
    );
    lines.push(
      ...wrapText(
        `Parent: ${entry.parentEmail || '—'} | Phone: ${entry.parentPhone || '—'} | Reminder Sent: ${
          entry.hasReminder ? 'Yes' : 'No'
        }`,
      ),
    );
    lines.push('');
  });
  return lines;
};

export const generateFeeCollectionReportPdf = async ({
  entries = [],
  filterSummary = 'No filters applied',
  generatedOn = new Date(),
  schoolName,
}) => {
  const { BLANK_PDF, generate } = await import('pdfme');
  const schema = buildBaseSchema();
  const footerBarSvg = buildFooterBarSvg();
  const introLines = [
    schoolName || 'The Elden Heights School',
    'Fee Collection Report',
    `Generated on: ${generatedOn.toLocaleString('en-IN')}`,
    `Filters: ${filterSummary}`,
  ];
  const introText = introLines
    .map((line) => wrapText(line, 110).join('\n'))
    .join('\n');
  const bodyLines = buildEntryLines(entries);
  const linesPerPage = getLinesPerPage();
  const pagedLines = paginateLines(bodyLines, linesPerPage);
  const schemas = pagedLines.map(() => JSON.parse(JSON.stringify(schema)));
  const inputs = pagedLines.map((pageLines) => ({
    headerTitle: 'The Elden Heights SchooL',
    headerSubtitle: 'Finance & Fee Overview',
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
