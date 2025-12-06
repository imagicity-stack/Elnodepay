const INCH_TO_MM = 25.4;
const HEADER_HEIGHT = 2 * INCH_TO_MM;
const HEADER_MARGIN_BELOW = 0.5 * INCH_TO_MM;
const SIDE_MARGIN = 1.5 * INCH_TO_MM;
const FOOTER_HEIGHT = 1 * INCH_TO_MM;
const BOTTOM_MARGIN = 1.5 * INCH_TO_MM;

const SCHOOL_NAME = 'THE ELDEN HEIGHTS SCHOOL.';
const FOOTER_TEXT =
  'The Elden Heights School | A unit of Bhagwati Educational And Charitable Trust | Opposite B.S.F Firing Range, Siwar, Hazaribagh 825317\nCBSE Affiliation No. XXXXXXX | Contact: +91 9431904333 | www.eldenheights.org';
const BRAND_RED = { r: 140, g: 25, b: 27 };

const toMm = (inches) => inches * INCH_TO_MM;

const applyBranding = (doc, dimensions) => {
  const { pageWidth, pageHeight } = dimensions;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, 'F');

  doc.setFont('times', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(22);
  doc.text(SCHOOL_NAME, pageWidth / 2, HEADER_HEIGHT / 2 + 4, { align: 'center' });

  doc.setFillColor(BRAND_RED.r, BRAND_RED.g, BRAND_RED.b);
  doc.rect(0, pageHeight - FOOTER_HEIGHT, pageWidth, FOOTER_HEIGHT, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  const footerLines = doc.splitTextToSize(FOOTER_TEXT, pageWidth - 20);
  const footerStartY = pageHeight - FOOTER_HEIGHT + 8;
  doc.text(footerLines, pageWidth / 2, footerStartY, { align: 'center' });

  doc.setTextColor(33, 37, 41);
  doc.setFont('times', 'normal');
};

const createBrandedDocument = async () => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const dimensions = {
    pageWidth,
    pageHeight,
    headerHeight: HEADER_HEIGHT,
    footerHeight: FOOTER_HEIGHT,
    marginLeft: SIDE_MARGIN,
    marginRight: SIDE_MARGIN,
    marginBottom: BOTTOM_MARGIN + FOOTER_HEIGHT,
    contentStartY: HEADER_HEIGHT + HEADER_MARGIN_BELOW,
  };
  dimensions.contentWidth = pageWidth - dimensions.marginLeft - dimensions.marginRight;

  applyBranding(doc, dimensions);

  const addPageWithBranding = () => {
    doc.addPage('a4');
    applyBranding(doc, dimensions);
  };

  return { doc, dimensions, addPageWithBranding };
};

export {
  BRAND_RED,
  FOOTER_HEIGHT,
  FOOTER_TEXT,
  HEADER_HEIGHT,
  SIDE_MARGIN,
  createBrandedDocument,
  toMm,
};
