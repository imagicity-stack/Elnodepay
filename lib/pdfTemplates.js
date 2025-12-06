import { PageSizes, PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const INCH = 72;
const HEADER_HEIGHT = 2 * INCH;
const FOOTER_HEIGHT = 1 * INCH;
const SIDE_MARGIN = 1.5 * INCH;
const TOP_MARGIN = 0.5 * INCH;
const BOTTOM_MARGIN = 1.5 * INCH;

const BRAND_HEADER = 'The Elden Heights SchooL';
const BRAND_FOOTER =
  'The Elden Heights School | A unit of Bhagwati Educational And Charitable Trust | Opposite B.S.F Firing Range, Siwar, Hazaribagh 825317\nCBSE Affiliation No. XXXXXXX | Contact: +91 9431904333 | www.eldenheights.org';
const FOOTER_COLOR = rgb(0.549, 0.098, 0.106);

const formatCurrency = (value = 0) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const formatDate = (date) => {
  if (!date) return '—';
  const parsed = date?.toDate ? date.toDate() : new Date(date);
  return Number.isFinite(parsed?.getTime())
    ? parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
};

const wrapText = (text, font, size, maxWidth) => {
  if (!text) return [''];
  const words = `${text}`.split(/\s+/);
  const lines = [];
  let currentLine = '';

  words.forEach((word) => {
    const prospectiveLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(prospectiveLine, size);
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = prospectiveLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

const drawHeaderFooter = (page, fonts) => {
  const { width, height } = page.getSize();

  // Header band
  page.drawRectangle({
    x: 0,
    y: height - HEADER_HEIGHT,
    width,
    height: HEADER_HEIGHT,
    color: rgb(1, 1, 1),
  });

  const headerSize = 26;
  const headerTextWidth = fonts.bold.widthOfTextAtSize(BRAND_HEADER, headerSize);
  page.drawText(BRAND_HEADER, {
    x: (width - headerTextWidth) / 2,
    y: height - HEADER_HEIGHT / 2 - headerSize / 2,
    size: headerSize,
    font: fonts.bold,
    color: rgb(0.07, 0.07, 0.07),
  });

  // Footer band
  page.drawRectangle({ x: 0, y: 0, width, height: FOOTER_HEIGHT, color: FOOTER_COLOR });

  const footerSize = 10;
  const footerLineHeight = 14;
  const footerLines = BRAND_FOOTER.split('\n');
  const footerMaxWidth = width - SIDE_MARGIN * 0.5;
  let footerY = (FOOTER_HEIGHT - footerLines.length * footerLineHeight) / 2 + footerLineHeight / 2;

  footerLines.forEach((line) => {
    const wrapped = wrapText(line, fonts.regular, footerSize, footerMaxWidth);
    wrapped.forEach((segment) => {
      const textWidth = fonts.regular.widthOfTextAtSize(segment, footerSize);
      page.drawText(segment, {
        x: (width - textWidth) / 2,
        y: footerY,
        size: footerSize,
        font: fonts.regular,
        color: rgb(1, 1, 1),
      });
      footerY += footerLineHeight;
    });
  });
};

const createDocument = async () => {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
    bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
  };
  return { pdfDoc, fonts };
};

const startPage = (pdfDoc, fonts) => {
  const page = pdfDoc.addPage(PageSizes.A4);
  drawHeaderFooter(page, fonts);
  const { height } = page.getSize();
  const contentTop = height - HEADER_HEIGHT - TOP_MARGIN;
  const contentBottom = FOOTER_HEIGHT + BOTTOM_MARGIN;
  return { page, cursorY: contentTop, contentBottom };
};

const ensureSpace = (context, fonts, spaceNeeded = 40) => {
  if (context.cursorY - spaceNeeded <= context.contentBottom) {
    const next = startPage(context.pdfDoc, fonts);
    context.page = next.page;
    context.cursorY = next.cursorY;
    context.contentBottom = next.contentBottom;
  }
};

const drawTextBlock = (context, text, fonts, options = {}) => {
  const {
    x = SIDE_MARGIN,
    size = 12,
    lineHeight = 16,
    font = fonts.regular,
    color = rgb(0.1, 0.1, 0.1),
  } = options;
  const { page } = context;
  const maxWidth = page.getSize().width - x - SIDE_MARGIN;
  const lines = wrapText(text, font, size, maxWidth);
  ensureSpace(context, fonts, lines.length * lineHeight + 4);

  lines.forEach((line) => {
    page.drawText(line, { x, y: context.cursorY, size, font, color });
    context.cursorY -= lineHeight;
  });

  return lines.length * lineHeight;
};

const downloadPdf = async (pdfDoc, filename) => {
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const generateFeeCollectionReportPdf = async ({ entries = [], summaryText = '', schoolName = '' }) => {
  const { pdfDoc, fonts } = await createDocument();
  const context = { pdfDoc, ...startPage(pdfDoc, fonts) };
  const { page } = context;
  const { width } = page.getSize();
  const maxWidth = width - SIDE_MARGIN * 2;

  // Title block
  drawTextBlock(context, schoolName || 'The Elden Heights School', fonts, {
    size: 14,
    lineHeight: 20,
    font: fonts.bold,
  });
  drawTextBlock(context, 'Fee Collection Report', fonts, { size: 18, lineHeight: 26, font: fonts.bold });
  drawTextBlock(
    context,
    `Generated on: ${new Date().toLocaleString('en-IN')}\nFilters: ${summaryText || 'None applied'}`,
    fonts,
    { size: 11, lineHeight: 16 },
  );
  context.cursorY -= 8;

  const lineHeight = 16;

  entries.forEach((entry, index) => {
    const heading = `${index + 1}. ${entry.studentName || 'Student'} (${entry.studentId || '-'})`;
    const lines = [
      `Class & Section: ${entry.class || '—'}${entry.section ? ` · ${entry.section}` : ''} | Session: ${
        entry.session || '—'
      }`,
      `Status: ${entry.statusLabel || '—'} | Cycle: ${entry.cycle || '—'} | Term: ${entry.term || '—'}`,
      `Due Date: ${formatDate(entry.dueDate)} | Paid Date: ${formatDate(entry.paidDate)}`,
      `Payment Mode: ${entry.paymentModeLabel || '—'} | Transaction ID: ${entry.transactionId || '—'}`,
      `Amount: ${formatCurrency(entry.amount)} | Balance: ${formatCurrency(entry.balance)} | Store Charge: ${formatCurrency(
        entry.storeAmount,
      )}`,
      `Parent Contact: ${entry.parentEmail || '—'} | ${entry.parentPhone || '—'} | Reminder Sent: ${
        entry.hasReminder ? 'Yes' : 'No'
      }`,
    ];

    const wrappedLines = lines
      .map((line) => wrapText(line, fonts.regular, 12, maxWidth))
      .reduce((all, current) => [...all, ...current], []);
    const requiredHeight = (wrappedLines.length + 2) * lineHeight + 12;

    ensureSpace(context, fonts, requiredHeight);

    page.drawRectangle({
      x: SIDE_MARGIN - 8,
      y: context.cursorY - requiredHeight + lineHeight,
      width: maxWidth + 16,
      height: requiredHeight,
      color: rgb(0.97, 0.97, 0.99),
      borderColor: rgb(0.82, 0.84, 0.88),
      borderWidth: 1,
    });

    drawTextBlock(context, heading, fonts, { size: 13, lineHeight, font: fonts.bold });
    lines.forEach((line) => {
      drawTextBlock(context, line, fonts, { size: 12, lineHeight });
    });

    context.cursorY -= 10;
  });

  if (!entries.length) {
    drawTextBlock(context, 'No records match the selected filters.', fonts, { size: 12, lineHeight });
  }

  await downloadPdf(pdfDoc, 'fee-collection-report.pdf');
};

export const generateStudentHistoryPdf = async ({ student = {}, entries = [] }) => {
  const { pdfDoc, fonts } = await createDocument();
  const context = { pdfDoc, ...startPage(pdfDoc, fonts) };
  const { page } = context;
  const { width } = page.getSize();
  const maxWidth = width - SIDE_MARGIN * 2;
  const studentId = student.studentId || student.id || 'Student';
  const title = `Fee Report · ${student.name || studentId}`;

  drawTextBlock(context, title, fonts, { size: 18, lineHeight: 26, font: fonts.bold });
  drawTextBlock(context, `Student ID: ${studentId}\nClass: ${student.class || '—'}`, fonts, {
    size: 12,
    lineHeight: 18,
  });
  drawTextBlock(context, `Generated on: ${new Date().toLocaleString('en-IN')}`, fonts, { size: 11, lineHeight: 16 });
  context.cursorY -= 6;

  const lineHeight = 16;

  if (!entries.length) {
    drawTextBlock(context, 'No payments recorded yet.', fonts, { size: 12, lineHeight });
  }

  entries.forEach((payment, index) => {
    const breakdownLines = Array.isArray(payment.breakdown)
      ? payment.breakdown.map((item) => `• ${item.label || 'Fee'} — ${formatCurrency(item.amount)}`)
      : [];
    const lines = [
      `Amount: ${formatCurrency(payment.amount)}`,
      `Mode: ${payment.mode || 'Online'} | Transaction ID: ${payment.transaction_id || '—'}`,
      `Date: ${formatDate(payment.date)}`,
      ...breakdownLines,
    ];

    const wrappedLines = lines
      .map((line) => wrapText(line, fonts.regular, 12, maxWidth))
      .reduce((all, current) => [...all, ...current], []);
    const requiredHeight = (wrappedLines.length + 2) * lineHeight + 10;

    ensureSpace(context, fonts, requiredHeight);

    drawTextBlock(context, `Payment ${index + 1}`, fonts, { size: 13, lineHeight, font: fonts.bold });
    lines.forEach((line) => {
      drawTextBlock(context, line, fonts, { size: 12, lineHeight });
    });

    context.cursorY -= 6;
  });

  const fileSafeId = `${studentId}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  await downloadPdf(pdfDoc, `fee-report-${fileSafeId}.pdf`);
};
