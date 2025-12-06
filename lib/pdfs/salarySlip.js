import { buildBrandedDefinition, loadPdfMake } from './base';

const formatCurrency = (value = 0) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const buildKeyValueColumns = (pairs) => ({
  margin: [0, 0, 0, 12],
  columns: pairs.map((pair) => ({
    width: '*',
    stack: [
      { text: pair.label, style: 'label' },
      { text: pair.value, bold: true, color: '#0f172a', margin: [0, 2, 0, 0] },
    ],
  })),
  columnGap: 16,
});

const buildEarningsTable = (rows, title) => ({
  layout: {
    fillColor: (rowIndex) => (rowIndex === 0 ? '#e2e8f0' : rowIndex % 2 === 0 ? '#f8fafc' : null),
    hLineColor: '#e2e8f0',
    vLineColor: '#e2e8f0',
  },
  table: {
    headerRows: 1,
    widths: ['*', 'auto'],
    body: [
      [
        { text: title, style: 'tableHeader' },
        { text: 'Amount (₹)', style: 'tableHeader', alignment: 'right' },
      ],
      ...rows.map((row) => [
        { text: row.label, margin: [6, 4, 6, 4] },
        { text: formatCurrency(row.value), style: 'tableNumber' },
      ]),
    ],
  },
});

const buildSummaryBanner = (salary) => ({
  margin: [0, 14, 0, 0],
  layout: 'noBorders',
  table: {
    widths: ['*'],
    body: [
      [
        {
          fillColor: '#ecfdf3',
          margin: [0, 0, 0, 0],
          stack: [
            {
              columns: [
                { text: 'Net Payable', style: 'label' },
                { text: formatCurrency(salary.netPayable), alignment: 'right', bold: true, fontSize: 14, color: '#0f172a' },
              ],
              margin: [12, 10, 12, 4],
            },
            {
              columns: [
                { text: `Status: ${salary.paymentStatus || 'Pending'}`, style: 'small' },
                {
                  text: `Processed on: ${
                    salary.processedAt
                      ? new Date(salary.processedAt.seconds * 1000).toLocaleString()
                      : 'Draft'
                  }`,
                  style: 'small',
                  alignment: 'right',
                },
              ],
              margin: [12, 0, 12, 10],
            },
          ],
        },
      ],
    ],
  },
});

const buildSalaryRows = (salary, structure) => {
  const allowances = salary.allowancesSnapshot || structure || {};
  const deductions = salary.deductionsSnapshot || {};

  const earningRows = [
    { label: 'Basic Pay', value: allowances.basicPay },
    { label: 'HRA', value: allowances.hra },
    { label: 'DA', value: allowances.da },
    { label: 'Special Allowance', value: allowances.specialAllowance },
    { label: 'Conveyance Allowance', value: allowances.conveyanceAllowance },
    { label: 'Medical Allowance', value: allowances.medicalAllowance },
    ...(allowances.otherAllowances || []).map((item) => ({
      label: item.label || 'Allowance',
      value: item.amount,
    })),
  ];

  if (salary.overtimeAmount) {
    earningRows.push({ label: 'Overtime', value: salary.overtimeAmount });
  }
  if (salary.extraPayments && salary.extraPayments.length) {
    salary.extraPayments.forEach((item) => {
      earningRows.push({ label: item.label || 'Additional', value: item.amount });
    });
  }
  earningRows.push({ label: 'Gross Salary', value: salary.grossSalary });

  const deductionRows = [
    { label: 'PF (Employee)', value: deductions.pfEmployeeContribution },
    { label: 'PF (Employer)', value: deductions.pfEmployerContribution },
    { label: 'ESI', value: deductions.esiContribution },
    { label: 'Professional Tax', value: deductions.professionalTax },
    { label: 'TDS', value: deductions.tdsAmount },
    { label: 'Advance Recovery', value: deductions.advanceRecoveryPerMonth },
    ...(deductions.otherDeductions || []).map((item) => ({
      label: item.label || 'Deduction',
      value: item.amount,
    })),
  ];

  if (salary.penaltiesAmount) {
    deductionRows.push({ label: 'Penalties', value: salary.penaltiesAmount });
  }
  deductionRows.push({ label: 'Total Deductions', value: salary.totalDeductions });

  return { earningRows, deductionRows };
};

const generateSalarySlipPdf = async ({ salary, staff, structure, monthLabel }) => {
  const pdfMake = await loadPdfMake();
  const { earningRows, deductionRows } = buildSalaryRows(salary, structure);

  const staffDetails = buildKeyValueColumns([
    { label: 'Staff Name', value: staff?.fullName || staff?.staffNameSnapshot || '—' },
    { label: 'Staff ID', value: staff?.staffId || '—' },
    { label: 'Designation', value: `${staff?.designationCategory || '—'} · ${staff?.subRole || '—'}` },
    { label: 'Slip Month', value: monthLabel || `${salary.month}/${salary.year}` },
  ]);

  const content = [
    { text: 'Salary Slip', style: 'title', margin: [0, 0, 0, 6] },
    staffDetails,
    {
      columns: [
        { width: '50%', stack: [buildEarningsTable(earningRows, 'Earnings')] },
        { width: '50%', stack: [buildEarningsTable(deductionRows, 'Deductions')] },
      ],
      columnGap: 16,
    },
    buildSummaryBanner(salary),
  ];

  const fileSafeId = `${salary.staffId || staff?.staffId || 'salary'}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const docDefinition = buildBrandedDefinition(content, {
    info: { title: 'Salary Slip' },
  });

  pdfMake.createPdf(docDefinition).download(`salary-slip-${fileSafeId}-${salary.year}-${salary.month}.pdf`);
};

export { generateSalarySlipPdf };
