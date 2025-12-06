import { buildBrandedDefinition, loadPdfMake } from './base';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const formatDateDisplay = (date) =>
  date instanceof Date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const buildFiltersSummary = (summaryText) => ({
  columns: [
    { text: 'Fee Collection Report', style: 'title' },
    {
      stack: [
        { text: `Generated on ${new Date().toLocaleString()}`, style: 'small', alignment: 'right' },
        { text: summaryText ? `Filters: ${summaryText}` : 'All entries included', style: 'small', alignment: 'right' },
      ],
    },
  ],
  columnGap: 16,
  margin: [0, 0, 0, 10],
});

const buildEntryTable = (entries) => ({
  layout: {
    fillColor: (rowIndex) => (rowIndex === 0 ? '#f8fafc' : rowIndex % 2 === 0 ? '#f8fafc' : null),
    hLineColor: '#e2e8f0',
    vLineColor: '#e2e8f0',
  },
  table: {
    headerRows: 1,
    widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
    body: [
      [
        { text: '#', style: 'tableHeader', alignment: 'center' },
        { text: 'Student', style: 'tableHeader' },
        { text: 'Class', style: 'tableHeader' },
        { text: 'Status', style: 'tableHeader' },
        { text: 'Amount', style: 'tableHeader', alignment: 'right' },
        { text: 'Balance', style: 'tableHeader', alignment: 'right' },
        { text: 'Due Date', style: 'tableHeader' },
        { text: 'Paid On', style: 'tableHeader' },
        { text: 'Mode', style: 'tableHeader' },
        { text: 'Txn ID', style: 'tableHeader' },
      ],
      ...entries.map((entry, index) => [
        { text: index + 1, alignment: 'center' },
        {
          stack: [
            { text: entry.studentName || 'Student', bold: true, color: '#0f172a' },
            {
              text: `${entry.studentId || '—'} · ${entry.session || '—'}${entry.term ? ` · ${entry.term}` : ''}`,
              style: 'small',
              color: '#475569',
            },
          ],
        },
        { text: `${entry.class || '—'}${entry.section ? `-${entry.section}` : ''}`, alignment: 'center' },
        { text: entry.statusLabel || '—', alignment: 'center' },
        { text: formatCurrency(entry.amount), style: 'tableNumber' },
        { text: formatCurrency(entry.balance), style: 'tableNumber' },
        { text: formatDateDisplay(entry.dueDate), alignment: 'center' },
        { text: formatDateDisplay(entry.paidDate), alignment: 'center' },
        { text: entry.paymentModeLabel || '—', alignment: 'center' },
        { text: entry.transactionId || '—', alignment: 'right' },
      ]),
    ],
  },
});

const buildParentNotes = (entries) => {
  const parentLines = entries.map((entry) => `• ${entry.parentEmail || '—'} · ${entry.parentPhone || '—'} · Reminder: ${
    entry.hasReminder ? 'Sent' : 'Not sent'
  } · Store: ${formatCurrency(entry.storeAmount)}`);
  return {
    margin: [0, 14, 0, 0],
    layout: 'noBorders',
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: 'Parent Communication & Charges', style: 'tableHeader', margin: [0, 0, 0, 6] },
              ...parentLines.map((line) => ({ text: line, style: 'small', margin: [0, 2, 0, 0] })),
            ],
          },
        ],
      ],
    },
  };
};

const generateFeeCollectionReportPdf = async ({ entries, summaryText }) => {
  const pdfMake = await loadPdfMake();
  const content = [buildFiltersSummary(summaryText), buildEntryTable(entries || []), buildParentNotes(entries || [])];
  const docDefinition = buildBrandedDefinition(content, {
    info: { title: 'Fee Collection Report' },
  });

  pdfMake.createPdf(docDefinition).download('fee-collection-report.pdf');
};

export { generateFeeCollectionReportPdf };
