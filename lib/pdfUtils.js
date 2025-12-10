import { generate } from '@pdfme/generator';
import { getDefaultFont } from '@pdfme/common';

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const HEADER_HEIGHT_MM = 50.8; // 2 inches
const HEADER_MARGIN_BELOW_MM = 12.7; // 0.5 inch
const FOOTER_HEIGHT_MM = 25.4; // 1 inch
const SIDE_MARGIN_MM = 38.1; // 1.5 inches
const BOTTOM_MARGIN_MM = 38.1; // 1.5 inches

const BODY_START_Y = HEADER_HEIGHT_MM + HEADER_MARGIN_BELOW_MM;
const CONTENT_WIDTH = PAGE_WIDTH_MM - SIDE_MARGIN_MM * 2;
const BODY_HEIGHT_MM = PAGE_HEIGHT_MM - FOOTER_HEIGHT_MM - BOTTOM_MARGIN_MM - BODY_START_Y;
const DEFAULT_LINES_PER_PAGE = Math.max(20, Math.floor(BODY_HEIGHT_MM / 5.5));
const DEFAULT_WRAP = 92;
const FOOTER_TEXT =
  'The Elden Heights School | A unit of Bhagwati Educational And Charitable Trust | Opposite B.S.F Firing Range, Siwar, Hazaribagh 825317\nCBSE Affiliation No. XXXXXXX | Contact: +91 9431904333 | www.eldenheights.org';

let fontCache = null;

const wrapText = (text, maxChars = DEFAULT_WRAP) => {
  if (!text) return [];
  const words = `${text}`.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else if (candidate.length > maxChars) {
      lines.push(candidate);
      current = '';
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
};

const normalizeLines = (lines) =>
  lines
    .filter(Boolean)
    .map((line) => (Array.isArray(line) ? line.join(' ') : line))
    .flatMap((line) => wrapText(line.trim()));

const chunkLines = (lines, firstPageLimit, perPageLimit = DEFAULT_LINES_PER_PAGE) => {
  const pages = [];
  let remaining = [...lines];
  let firstChunk = remaining.splice(0, firstPageLimit);
  if (firstChunk.length) pages.push(firstChunk);
  while (remaining.length) {
    pages.push(remaining.splice(0, perPageLimit));
  }
  return pages.length ? pages : [[]];
};

const downloadPdf = (pdfBytes, fileName) => {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const getFonts = async () => {
  if (fontCache) return fontCache;
  const defaultFont = getDefaultFont();
  fontCache = {
    ...(defaultFont || {}),
  };
  if (fontCache?.Roboto) {
    fontCache.Roboto = { ...fontCache.Roboto, fallback: true };
  }
  try {
    const response = await fetch('/fonts/PlayfairDisplay-Regular.ttf');
    if (response.ok) {
      const data = await response.arrayBuffer();
      fontCache['Playfair Display'] = { data };
    }
  } catch (error) {
    console.error('Unable to load serif font for PDFs', error);
  }
  return fontCache;
};

const buildBasePdf = () => ({
  width: PAGE_WIDTH_MM,
  height: PAGE_HEIGHT_MM,
  padding: [0, 0, 0, 0],
  staticSchema: [
    {
      name: 'headerTitle',
      type: 'text',
      content: 'The Elden Heights SchooL',
      position: { x: SIDE_MARGIN_MM, y: 12 },
      width: CONTENT_WIDTH,
      height: HEADER_HEIGHT_MM - 20,
      fontSize: 22,
      fontName: 'Playfair Display',
      fontColor: '#000000',
      alignment: 'center',
      lineHeight: 1.2,
    },
    {
      name: 'footerBar',
      type: 'text',
      content: FOOTER_TEXT,
      position: { x: 0, y: PAGE_HEIGHT_MM - FOOTER_HEIGHT_MM },
      width: PAGE_WIDTH_MM,
      height: FOOTER_HEIGHT_MM,
      fontSize: 10,
      fontColor: '#ffffff',
      backgroundColor: '#8c191b',
      alignment: 'center',
      lineHeight: 1.3,
    },
  ],
});

const buildPageSchema = (pageIndex, summaryHeight) => {
  const schemas = [];
  let currentY = BODY_START_Y;
  if (pageIndex === 0) {
    const titleHeight = 14;
    schemas.push({
      name: `title_${pageIndex}`,
      type: 'text',
      content: '',
      position: { x: SIDE_MARGIN_MM, y: currentY },
      width: CONTENT_WIDTH,
      height: titleHeight,
      fontSize: 16,
      fontName: 'Playfair Display',
      fontColor: '#111827',
      lineHeight: 1.3,
      alignment: 'left',
    });
    currentY += titleHeight + 4;
    const introHeight = Math.max(18, summaryHeight);
    schemas.push({
      name: `summary_${pageIndex}`,
      type: 'text',
      content: '',
      position: { x: SIDE_MARGIN_MM, y: currentY },
      width: CONTENT_WIDTH,
      height: introHeight,
      fontSize: 10.5,
      fontColor: '#111827',
      lineHeight: 1.5,
      alignment: 'left',
    });
    currentY += introHeight + 6;
  }
  const bodyHeight = PAGE_HEIGHT_MM - FOOTER_HEIGHT_MM - BOTTOM_MARGIN_MM - currentY;
  schemas.push({
    name: `body_${pageIndex}`,
    type: 'text',
    content: '',
    position: { x: SIDE_MARGIN_MM, y: currentY },
    width: CONTENT_WIDTH,
    height: bodyHeight,
    fontSize: 10,
    fontColor: '#0f172a',
    lineHeight: 1.5,
    alignment: 'left',
  });
  return schemas;
};

const generateSchoolPdf = async ({ title, summaryLines = [], bodyLines = [], fileName }) => {
  if (typeof window === 'undefined') return false;
  const normalizedSummary = normalizeLines(summaryLines);
  const normalizedBody = normalizeLines(bodyLines);
  const introLinesEstimate = Math.max(3, normalizedSummary.length + 1);
  const firstPageLimit = Math.max(10, DEFAULT_LINES_PER_PAGE - introLinesEstimate - 3);
  const pages = chunkLines(normalizedBody, firstPageLimit);
  const summaryHeight = Math.max(18, normalizedSummary.length * 6.2);
  const template = {
    basePdf: buildBasePdf(),
    schemas: pages.map((_, index) => buildPageSchema(index, summaryHeight)),
  };
  const inputs = pages.map((pageLines, index) => {
    const payload = {
      [`body_${index}`]: pageLines.join('\n'),
    };
    if (index === 0) {
      payload[`title_${index}`] = title;
      payload[`summary_${index}`] = normalizedSummary.join('\n');
    }
    return payload;
  });
  const pdfBytes = await generate({
    template,
    inputs,
    options: {
      font: await getFonts(),
      author: 'The Elden Heights School',
      producer: 'EL-NODE Pay',
      title,
    },
  });
  downloadPdf(pdfBytes, fileName);
  return true;
};

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const formatDate = (value) => {
  if (!value) return '—';
  const parsed = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(parsed?.getTime())) return '—';
  return parsed.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const downloadFeeReceiptPdf = async (payment) => {
  if (!payment) return false;
  const summaryLines = [
    `Student: ${payment.student_name || 'N/A'}`,
    `Class: ${payment.class || '—'}`,
    `Paid on: ${formatDate(payment.date)}`,
    `Payment mode: ${payment.mode || 'Online'}`,
    `Transaction: ${payment.razorpay_payment_id || payment.transaction_id || 'N/A'}`,
  ];
  const breakdownLines = (payment.breakdown || []).map(
    (item) => `${item.label || 'Fee Component'} — ${formatCurrency(item.amount)}`,
  );
  const bodyLines = [
    `Receipt Status: ${payment.status || 'Processed'}`,
    `Amount Paid: ${formatCurrency(payment.amount)}`,
    '',
    breakdownLines.length ? 'Breakdown:' : 'Payment applied to tuition.',
    ...breakdownLines,
    '',
    'Thank you for keeping your fee payments up to date.',
  ];
  const fileName = `fee-receipt-${(payment.student_name || payment.studentId || 'student')
    .toString()
    .replace(/\s+/g, '-')}.pdf`;
  return generateSchoolPdf({ title: 'Fee Receipt', summaryLines, bodyLines, fileName });
};

export const downloadFeeCollectionReportPdf = async (entries, summaryText) => {
  if (!Array.isArray(entries) || entries.length === 0) return false;
  const summaryLines = ['Fee Collection Report', `Filters: ${summaryText || 'All records'}`, `Generated: ${formatDate(new Date())}`];
  const bodyLines = entries.map((entry, index) => {
    const dueDate = entry.dueDate || entry.due_date;
    return `${index + 1}. ${entry.studentName || entry.student_name || 'Student'} (${entry.studentId || entry.student_id || 'ID'}) — ${entry.class || 'Class'} ${
      entry.section ? `· ${entry.section}` : ''
    } | ${entry.statusLabel || entry.status || 'Status'} | Amount ${formatCurrency(entry.amount)} | Balance ${formatCurrency(
      entry.balance,
    )} | Due ${formatDate(dueDate)}`;
  });
  const fileName = 'fee-collection-report.pdf';
  return generateSchoolPdf({ title: 'Fee Collection Report', summaryLines, bodyLines, fileName });
};

export const downloadFeeHistoryPdf = async (student, entries) => {
  if (!student) return false;
  const summaryLines = [
    `Student: ${student.name || student.studentName || student.studentId}`,
    `Class: ${student.class || '—'}`,
    `Generated: ${formatDate(new Date())}`,
  ];
  const bodyLines = entries.length
    ? entries.map((payment, index) => {
        const parts = [
          `${index + 1}. Payment of ${formatCurrency(payment.amount)} on ${formatDate(payment.date)}`,
          `Mode: ${payment.mode || 'Online'}${payment.transaction_id ? ` · Txn: ${payment.transaction_id}` : ''}`,
        ];
        if (payment.breakdown && Array.isArray(payment.breakdown) && payment.breakdown.length) {
          parts.push(...payment.breakdown.map((item) => `   • ${item.label || 'Fee'} — ${formatCurrency(item.amount)}`));
        }
        return parts.join('\n');
      })
    : ['No payments recorded yet.'];
  const fileName = `fee-history-${(student.studentId || student.id || 'student').toString().replace(/\s+/g, '-')}.pdf`;
  return generateSchoolPdf({ title: 'Payment History', summaryLines, bodyLines, fileName });
};

export const downloadAdmissionListPdf = async (title, rows, headers) => {
  if (!rows?.length) return false;
  const summaryLines = [title, `Generated: ${formatDate(new Date())}`, `Total entries: ${rows.length}`];
  const bodyLines = rows.map((row, index) => {
    const cells = headers.map((header) => `${header.label}: ${row[header.key] ?? '—'}`);
    return `${index + 1}. ${cells.join(' | ')}`;
  });
  return generateSchoolPdf({ title, summaryLines, bodyLines, fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.pdf` });
};

export const downloadSalarySlipPdf = async ({ staff, salary, monthLabel }) => {
  if (!staff || !salary) return false;
  const summaryLines = [
    `${staff.fullName} (${staff.staffId})`,
    `${staff.designationCategory || 'Role'}${staff.subRole ? ` · ${staff.subRole}` : ''}`,
    `Period: ${monthLabel}`,
    `Status: ${salary.paymentStatus || 'Pending'}${salary.paymentMethod ? ` · ${salary.paymentMethod}` : ''}`,
  ];
  const earnings = salary.allowancesSnapshot || salary.allowanceSnapshot || {};
  const deductions = salary.deductionsSnapshot || {};
  const earningLines = [
    `Basic: ${formatCurrency(earnings.basicPay)}`,
    `HRA: ${formatCurrency(earnings.hra)}`,
    `DA: ${formatCurrency(earnings.da)}`,
    `Special: ${formatCurrency(earnings.specialAllowance)}`,
    `Conveyance: ${formatCurrency(earnings.conveyanceAllowance)}`,
    `Medical: ${formatCurrency(earnings.medicalAllowance)}`,
    ...((earnings.otherAllowances || []).map((item) => `${item.label || 'Allowance'}: ${formatCurrency(item.amount)}`) || []),
    ...(salary.overtimeAmount ? [`Overtime: ${formatCurrency(salary.overtimeAmount)}`] : []),
    ...(salary.extraPayments || []).map((item) => `${item.label}: ${formatCurrency(item.amount)}`),
    `Gross Salary: ${formatCurrency(salary.grossSalary)}`,
  ];
  const deductionLines = [
    `PF (Employee): ${formatCurrency(deductions.pfEmployeeContribution)}`,
    `PF (Employer): ${formatCurrency(deductions.pfEmployerContribution)}`,
    `ESI: ${formatCurrency(deductions.esiContribution)}`,
    `Professional Tax: ${formatCurrency(deductions.professionalTax)}`,
    `TDS: ${formatCurrency(deductions.tdsAmount)}`,
    `Advance Recovery: ${formatCurrency(deductions.advanceRecoveryPerMonth)}`,
    ...((deductions.otherDeductions || []).map((item) => `${item.label}: ${formatCurrency(item.amount)}`) || []),
    ...(salary.penaltiesAmount ? [`Penalties: ${formatCurrency(salary.penaltiesAmount)}`] : []),
    `Total Deductions: ${formatCurrency(salary.totalDeductions)}`,
  ];
  const bodyLines = [
    'Earnings:',
    ...earningLines,
    '',
    'Deductions:',
    ...deductionLines,
    '',
    `Net Payable: ${formatCurrency(salary.netPayable)}`,
    salary.processedAt ? `Processed on: ${formatDate(salary.processedAt.seconds ? salary.processedAt.seconds * 1000 : salary.processedAt)}` : 'Draft slip',
  ];
  const fileName = `salary-slip-${(staff.staffId || 'staff').toString().replace(/\s+/g, '-')}-${monthLabel.replace(/\s+/g, '-')}.pdf`;
  return generateSchoolPdf({ title: 'Salary Slip', summaryLines, bodyLines, fileName });
};
