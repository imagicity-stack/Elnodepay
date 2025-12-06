import { createBrandedDocument } from './base';

const formatCurrency = (value = 0) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const ensureSpace = (dimensions, addPage, y, requiredSpace) => {
  if (y + requiredSpace > dimensions.pageHeight - dimensions.marginBottom) {
    addPage();
    return dimensions.contentStartY;
  }
  return y;
};

const addKeyValue = (doc, x, y, label, value) => {
  doc.setFont('times', 'bold');
  doc.text(label, x, y);
  doc.setFont('times', 'normal');
  doc.text(value, x + 45, y);
};

const addSection = (doc, dimensions, addPage, y, title, rows, accentColor = { r: 226, g: 232, b: 240 }) => {
  const { marginLeft, contentWidth } = dimensions;
  const baseHeight = 18 + rows.length * 6;
  y = ensureSpace(dimensions, addPage, y, baseHeight);

  doc.setFillColor(accentColor.r, accentColor.g, accentColor.b);
  doc.roundedRect(marginLeft, y, contentWidth, baseHeight, 3, 3, 'F');
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text(title, marginLeft + 6, y + 8);
  doc.setFont('times', 'normal');
  doc.setFontSize(10);

  let cursorY = y + 16;
  rows.forEach((row) => {
    doc.text(row.label, marginLeft + 10, cursorY);
    doc.text(row.value, marginLeft + contentWidth - 10, cursorY, { align: 'right' });
    cursorY += 6;
  });

  return y + baseHeight + 6;
};

const buildSalaryRows = (salary, structure) => {
  const allowances = salary.allowancesSnapshot || structure || {};
  const deductions = salary.deductionsSnapshot || {};

  const earningRows = [
    { label: 'Basic Pay', value: formatCurrency(allowances.basicPay) },
    { label: 'HRA', value: formatCurrency(allowances.hra) },
    { label: 'DA', value: formatCurrency(allowances.da) },
    { label: 'Special Allowance', value: formatCurrency(allowances.specialAllowance) },
    { label: 'Conveyance Allowance', value: formatCurrency(allowances.conveyanceAllowance) },
    { label: 'Medical Allowance', value: formatCurrency(allowances.medicalAllowance) },
    ...(allowances.otherAllowances || []).map((item) => ({
      label: item.label || 'Allowance',
      value: formatCurrency(item.amount),
    })),
  ];

  if (salary.overtimeAmount) {
    earningRows.push({ label: 'Overtime', value: formatCurrency(salary.overtimeAmount) });
  }
  if (salary.extraPayments && salary.extraPayments.length) {
    salary.extraPayments.forEach((item) => {
      earningRows.push({ label: item.label || 'Additional', value: formatCurrency(item.amount) });
    });
  }
  earningRows.push({ label: 'Gross Salary', value: formatCurrency(salary.grossSalary) });

  const deductionRows = [
    { label: 'PF (Employee)', value: formatCurrency(deductions.pfEmployeeContribution) },
    { label: 'PF (Employer)', value: formatCurrency(deductions.pfEmployerContribution) },
    { label: 'ESI', value: formatCurrency(deductions.esiContribution) },
    { label: 'Professional Tax', value: formatCurrency(deductions.professionalTax) },
    { label: 'TDS', value: formatCurrency(deductions.tdsAmount) },
    { label: 'Advance Recovery', value: formatCurrency(deductions.advanceRecoveryPerMonth) },
    ...(deductions.otherDeductions || []).map((item) => ({
      label: item.label || 'Deduction',
      value: formatCurrency(item.amount),
    })),
  ];

  if (salary.penaltiesAmount) {
    deductionRows.push({ label: 'Penalties', value: formatCurrency(salary.penaltiesAmount) });
  }
  deductionRows.push({ label: 'Total Deductions', value: formatCurrency(salary.totalDeductions) });

  return { earningRows, deductionRows };
};

const generateSalarySlipPdf = async ({ salary, staff, structure, monthLabel }) => {
  const { doc, dimensions, addPageWithBranding } = await createBrandedDocument();
  const { marginLeft, contentWidth } = dimensions;
  let y = dimensions.contentStartY;

  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('Salary Slip', marginLeft, y);
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  y += 7;
  addKeyValue(doc, marginLeft, y, 'Staff Name', staff?.fullName || staff?.staffNameSnapshot || '—');
  y += 6;
  addKeyValue(doc, marginLeft, y, 'Staff ID', staff?.staffId || '—');
  y += 6;
  addKeyValue(doc, marginLeft, y, 'Designation', `${staff?.designationCategory || '—'} · ${staff?.subRole || '—'}`);
  y += 6;
  addKeyValue(doc, marginLeft, y, 'Slip Month', monthLabel || `${salary.month}/${salary.year}`);
  y += 10;

  const { earningRows, deductionRows } = buildSalaryRows(salary, structure);
  y = addSection(doc, dimensions, addPageWithBranding, y, 'Earnings', earningRows, { r: 239, g: 246, b: 255 });
  y = addSection(doc, dimensions, addPageWithBranding, y, 'Deductions', deductionRows, { r: 255, g: 247, b: 237 });

  y = ensureSpace(dimensions, addPageWithBranding, y, 26);
  doc.setFillColor(237, 247, 237);
  doc.roundedRect(marginLeft, y, contentWidth, 26, 3, 3, 'F');
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text('Net Payable', marginLeft + 8, y + 12);
  doc.setFontSize(14);
  doc.text(formatCurrency(salary.netPayable), marginLeft + contentWidth - 8, y + 12, { align: 'right' });
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text(`Status: ${salary.paymentStatus || 'Pending'}`, marginLeft + 8, y + 20);
  doc.text(
    `Processed on: ${salary.processedAt ? new Date(salary.processedAt.seconds * 1000).toLocaleString() : 'Draft'}`,
    marginLeft + contentWidth - 8,
    y + 20,
    { align: 'right' },
  );

  const fileSafeId = `${salary.staffId || staff?.staffId || 'salary'}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  doc.save(`salary-slip-${fileSafeId}-${salary.year}-${salary.month}.pdf`);
};

export { generateSalarySlipPdf };
