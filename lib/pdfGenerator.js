import { generate } from '@pdfme/generator';
import { getDefaultFont } from '@pdfme/common';
import { svg, text } from '@pdfme/schemas';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const HEADER_HEIGHT = 144; // 2 inches
const FOOTER_HEIGHT = 72; // 1 inch
const SIDE_MARGIN = 108; // 1.5 inches
const BOTTOM_MARGIN = 108; // 1.5 inches
const TOP_MARGIN = 36; // 0.5 inches below header
const CONTENT_START_Y = HEADER_HEIGHT + TOP_MARGIN;
const CONTENT_WIDTH = A4_WIDTH - SIDE_MARGIN * 2;
const CONTENT_HEIGHT = A4_HEIGHT - CONTENT_START_Y - FOOTER_HEIGHT - BOTTOM_MARGIN;
const LINE_HEIGHT = 16;
const MAX_CHARS_PER_LINE = 90;
const FOOTER_COLOR = '#8c191b';
const FOOTER_TEXT =
  'The Elden Heights School | A unit of Bhagwati Educational And Charitable Trust | Opposite B.S.F Firing Range, Siwar, Hazaribagh 825317\nCBSE Affiliation No. XXXXXXX | Contact: +91 9431904333 | www.eldenheights.org';

let fontCache = null;
const pdfPlugins = { text, svg };

const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const loadFontBase64 = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Unable to load font for PDF generation');
  }
  const buffer = await response.arrayBuffer();
  return arrayBufferToBase64(buffer);
};

export const getPdfFonts = async () => {
  if (fontCache) return fontCache;
  const garamondData = await loadFontBase64('/fonts/EBGaramond-Regular.ttf');
  const defaultFonts = getDefaultFont();
  const normalizedDefaults = Object.fromEntries(
    Object.entries(defaultFonts).map(([key, value]) => [key, { ...value, fallback: false }]),
  );
  fontCache = {
    ...normalizedDefaults,
    Garamond: { data: garamondData, fallback: true },
  };
  return fontCache;
};

const wrapLine = (text, maxChars = MAX_CHARS_PER_LINE) => {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  words.forEach((word) => {
    if ((current + word).length <= maxChars) {
      current = current ? `${current} ${word}` : word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
};

const paginateLines = (lines) => {
  const wrappedLines = lines.flatMap((line) => wrapLine(line));
  const linesPerPage = Math.max(1, Math.floor(CONTENT_HEIGHT / LINE_HEIGHT));
  const pages = [];
  for (let i = 0; i < wrappedLines.length; i += linesPerPage) {
    pages.push(wrappedLines.slice(i, i + linesPerPage));
  }
  return pages.length ? pages : [[]];
};

const createPageSchema = () => [
  {
    name: 'headerTitle',
    type: 'text',
    position: { x: SIDE_MARGIN, y: 40 },
    width: A4_WIDTH - SIDE_MARGIN * 2,
    height: 40,
    fontSize: 28,
    fontName: 'Garamond',
    color: '#000000',
  },
  {
    name: 'documentTitle',
    type: 'text',
    position: { x: SIDE_MARGIN, y: 90 },
    width: A4_WIDTH - SIDE_MARGIN * 2,
    height: 26,
    fontSize: 16,
    fontName: 'Garamond',
    color: '#111111',
  },
  {
    name: 'subtitle',
    type: 'text',
    position: { x: SIDE_MARGIN, y: 118 },
    width: A4_WIDTH - SIDE_MARGIN * 2,
    height: 26,
    fontSize: 11,
    fontName: 'Garamond',
    color: '#222222',
  },
  {
    name: 'contentText',
    type: 'text',
    position: { x: SIDE_MARGIN, y: CONTENT_START_Y },
    width: CONTENT_WIDTH,
    height: CONTENT_HEIGHT,
    fontSize: 11,
    lineHeight: 1.4,
    fontName: 'Garamond',
    color: '#222222',
  },
  {
    name: 'pageNumber',
    type: 'text',
    position: { x: SIDE_MARGIN, y: A4_HEIGHT - FOOTER_HEIGHT - 18 },
    width: CONTENT_WIDTH,
    height: 16,
    fontSize: 10,
    fontName: 'Garamond',
    color: '#444444',
  },
  {
    name: 'footerBar',
    type: 'svg',
    position: { x: 0, y: A4_HEIGHT - FOOTER_HEIGHT },
    width: A4_WIDTH,
    height: FOOTER_HEIGHT,
    content: `<svg width="${A4_WIDTH}" height="${FOOTER_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${FOOTER_COLOR}" /></svg>`,
  },
  {
    name: 'footerText',
    type: 'text',
    position: { x: SIDE_MARGIN, y: A4_HEIGHT - FOOTER_HEIGHT + 12 },
    width: CONTENT_WIDTH,
    height: FOOTER_HEIGHT - 24,
    fontSize: 10,
    lineHeight: 1.3,
    fontName: 'Garamond',
    color: '#ffffff',
  },
];

const downloadPdfFile = (pdfBytes, filename) => {
  if (typeof window === 'undefined') return;
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const formatDateDisplay = (value) => {
  if (!value) return '—';
  const parsedDate =
    value instanceof Date
      ? value
      : typeof value === 'string' || typeof value === 'number'
      ? new Date(value)
      : value?.toDate
      ? value.toDate()
      : null;
  if (parsedDate && Number.isFinite(parsedDate.getTime())) {
    return parsedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return '—';
};

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const generateDocument = async ({ title, subtitle, lines, fileName }) => {
  const fonts = await getPdfFonts();
  const pages = paginateLines(lines);
  const schemas = Array.from({ length: pages.length }, () => createPageSchema());
  const template = {
    basePdf: { width: A4_WIDTH, height: A4_HEIGHT, padding: [0, 0, 0, 0] },
    schemas,
  };
  const inputs = pages.map((pageLines, index) => ({
    headerTitle: 'The Elden Heights SchooL',
    documentTitle: title,
    subtitle,
    contentText: pageLines.join('\n'),
    footerBar: '',
    footerText: FOOTER_TEXT,
    pageNumber: `Page ${index + 1} of ${pages.length}`,
  }));
  const pdfBytes = await generate({ template, inputs, plugins: pdfPlugins, options: { font: fonts } });
  downloadPdfFile(pdfBytes, fileName);
};

export const generateFeeCollectionPdf = async ({ schoolName, summaryText, entries }) => {
  const lines = [];
  lines.push(`${schoolName}`);
  lines.push('');
  lines.push(`Generated On: ${new Date().toLocaleString()}`);
  if (summaryText) {
    lines.push(`Filters: ${summaryText}`);
  }
  lines.push('');
  entries.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.studentName || 'Student'}`);
    lines.push(`Student ID: ${entry.studentId || '—'}`);
    lines.push(`Class: ${entry.class || '—'}${entry.section ? ` · Section ${entry.section}` : ''}`);
    lines.push(`Status: ${entry.statusLabel || '—'} · Cycle: ${entry.cycle || '—'}`);
    lines.push(`Session: ${entry.session || '—'} · Term: ${entry.term || '—'}`);
    lines.push(
      `Amount: ${formatCurrency(entry.amount)} · Balance: ${formatCurrency(entry.balance)} · Due: ${formatDateDisplay(
        entry.dueDate,
      )}`,
    );
    lines.push(
      `Paid: ${formatDateDisplay(entry.paidDate)} · Mode: ${entry.paymentModeLabel || '—'} · Txn: ${entry.transactionId || '—'}`,
    );
    lines.push(`Parent Contact: ${entry.parentPhone || '—'}${entry.parentEmail ? ` | ${entry.parentEmail}` : ''}`);
    lines.push(`Reminder Sent: ${entry.hasReminder ? 'Yes' : 'No'} · Store Charge: ${formatCurrency(entry.storeAmount)}`);
    lines.push('');
  });
  await generateDocument({ title: 'Fee Collection Report', subtitle: summaryText || '', lines, fileName: 'fee-collection-report.pdf' });
};

export const generateFeeHistoryPdf = async ({ student, entries }) => {
  const studentId = student.studentId || student.id || 'Student';
  const lines = [];
  lines.push(`Student: ${student.name || studentId}`);
  lines.push(`Student ID: ${studentId}`);
  lines.push(`Class: ${student.class || '-'}`);
  lines.push(`Generated On: ${new Date().toLocaleString()}`);
  lines.push('');
  if (!entries.length) {
    lines.push('No payments recorded yet.');
  } else {
    entries.forEach((payment, index) => {
      const amountLine = `Payment ${index + 1}: ${formatCurrency(payment.amount)} via ${payment.mode || 'Online'}`;
      const paymentDate = formatDateDisplay(payment.date);
      lines.push(amountLine);
      lines.push(`Date: ${paymentDate}`);
      if (payment.transaction_id) {
        lines.push(`Transaction ID: ${payment.transaction_id}`);
      }
      if (payment.note) {
        lines.push(`Note: ${payment.note}`);
      }
      if (Array.isArray(payment.breakdown) && payment.breakdown.length > 0) {
        lines.push('Breakdown:');
        payment.breakdown.forEach((item) => {
          lines.push(`• ${item.label || 'Fee'} — ${formatCurrency(item.amount)}`);
        });
      }
      lines.push('');
    });
  }
  await generateDocument({
    title: `Fee Report · ${student.name || studentId}`,
    subtitle: '',
    lines,
    fileName: `fee-report-${studentId.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.pdf`,
  });
};
