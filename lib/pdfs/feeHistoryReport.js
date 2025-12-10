import { buildBrandedDefinition, loadPdfMake } from './base';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const formatDateDisplay = (date) => {
  if (!date) return '—';
  if (date.toDate) {
    return date.toDate().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const asDate = new Date(date);
  return Number.isFinite(asDate.getTime())
    ? asDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
};

const buildStudentSummary = (student) => ({
  margin: [0, 0, 0, 10],
  columns: [
    {
      width: '*',
      stack: [
        { text: `Fee Report · ${student.name || student.studentId || 'Student'}`, style: 'title' },
        { text: `Class: ${student.class || '-'}`, style: 'subtitle' },
      ],
    },
    {
      width: 'auto',
      stack: [
        { text: `Student ID: ${student.studentId || student.id || '—'}`, style: 'small', alignment: 'right' },
        { text: `Generated on: ${new Date().toLocaleString()}`, style: 'small', alignment: 'right' },
      ],
    },
  ],
  columnGap: 16,
});

const buildPaymentsTable = (entries) => ({
  layout: {
    fillColor: (rowIndex) => (rowIndex === 0 ? '#f8fafc' : rowIndex % 2 === 0 ? '#f8fafc' : null),
    hLineColor: '#e2e8f0',
    vLineColor: '#e2e8f0',
  },
  table: {
    headerRows: 1,
    widths: ['auto', '*', 'auto', 'auto', 'auto'],
    body: [
      [
        { text: '#', style: 'tableHeader', alignment: 'center' },
        { text: 'Payment Details', style: 'tableHeader' },
        { text: 'Amount (₹)', style: 'tableHeader', alignment: 'right' },
        { text: 'Mode', style: 'tableHeader' },
        { text: 'Date', style: 'tableHeader' },
      ],
      ...entries.map((payment, index) => [
        { text: index + 1, alignment: 'center' },
        {
          stack: [
            { text: payment.breakdown?.map((item) => item.label).join(', ') || 'Payment', bold: true },
            payment.transaction_id ? { text: `Txn: ${payment.transaction_id}`, style: 'small' } : null,
            { text: payment.notes || '', style: 'small' },
          ].filter(Boolean),
        },
        { text: formatCurrency(payment.amount), style: 'tableNumber' },
        { text: payment.mode || 'Online', alignment: 'center' },
        { text: formatDateDisplay(payment.date), alignment: 'center' },
      ]),
    ],
  },
});

const buildBreakdownSections = (entries) =>
  entries
    .filter((payment) => payment.breakdown?.length)
    .map((payment, index) => ({
      margin: [0, 12, 0, 0],
      layout: {
        fillColor: (rowIndex) => (rowIndex === 0 ? '#f1f5f9' : null),
        hLineColor: '#e2e8f0',
        vLineColor: '#e2e8f0',
      },
      table: {
        headerRows: 1,
        widths: ['*', 'auto'],
        body: [
          [{ text: `Payment ${index + 1} Breakdown`, style: 'tableHeader' }, { text: 'Amount', style: 'tableHeader', alignment: 'right' }],
          ...payment.breakdown.map((item) => [
            { text: item.label || 'Fee', margin: [4, 4, 4, 4] },
            { text: formatCurrency(item.amount), style: 'tableNumber' },
          ]),
        ],
      },
    }));

const generateFeeHistoryReportPdf = async ({ student, entries }) => {
  const pdfMake = await loadPdfMake();
  const content = [
    buildStudentSummary(student),
    entries.length
      ? buildPaymentsTable(entries)
      : { text: 'No payments recorded yet.', margin: [0, 10, 0, 0], style: 'subtitle' },
    ...buildBreakdownSections(entries),
  ];

  const fileSafeId = `${student.studentId || student.id || 'student'}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const docDefinition = buildBrandedDefinition(content, {
    info: { title: 'Fee History Report' },
  });

  pdfMake.createPdf(docDefinition).download(`fee-report-${fileSafeId}.pdf`);
};

export { generateFeeHistoryReportPdf };
