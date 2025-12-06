const INCH_TO_PT = 72;
const HEADER_HEIGHT = 2 * INCH_TO_PT;
const HEADER_MARGIN_BELOW = 0.5 * INCH_TO_PT;
const SIDE_MARGIN = 1.5 * INCH_TO_PT;
const FOOTER_HEIGHT = 1 * INCH_TO_PT;
const BOTTOM_MARGIN = 1.5 * INCH_TO_PT;

const SCHOOL_NAME = 'THE ELDEN HEIGHTS SCHOOL.';
const FOOTER_TEXT =
  'The Elden Heights School | A unit of Bhagwati Educational And Charitable Trust | Opposite B.S.F Firing Range, Siwar, Hazaribagh 825317\nCBSE Affiliation No. XXXXXXX | Contact: +91 9431904333 | www.eldenheights.org';
const BRAND_RED = '#8c191b';

let pdfMakePromise;

const loadPdfMake = async () => {
  if (pdfMakePromise) return pdfMakePromise;

  pdfMakePromise = import('pdfmake/build/pdfmake').then(async (pdfMakeModule) => {
    const pdfMake = pdfMakeModule.default || pdfMakeModule;
    const fonts = await import('pdfmake/build/vfs_fonts');
    pdfMake.vfs = fonts.default?.pdfMake?.vfs || fonts.pdfMake.vfs;
    return pdfMake;
  });

  return pdfMakePromise;
};

const buildHeader = (pageSize) => ({
  margin: [0, 0, 0, 0],
  stack: [
    {
      canvas: [
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: pageSize.width,
          h: HEADER_HEIGHT,
          color: '#ffffff',
        },
      ],
    },
    {
      text: SCHOOL_NAME,
      fontSize: 22,
      bold: true,
      font: 'Times',
      color: '#000000',
      alignment: 'center',
      margin: [0, HEADER_HEIGHT / 2 - 12, 0, 0],
    },
  ],
});

const buildFooter = (pageSize) => ({
  margin: [0, 0, 0, 0],
  stack: [
    {
      canvas: [
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: pageSize.width,
          h: FOOTER_HEIGHT,
          color: BRAND_RED,
        },
      ],
    },
    {
      text: FOOTER_TEXT,
      alignment: 'center',
      color: 'white',
      fontSize: 9,
      lineHeight: 1.3,
      margin: [16, -FOOTER_HEIGHT + 20, 16, 0],
    },
  ],
});

const baseStyles = {
  title: { fontSize: 18, bold: true, color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#475569', margin: [0, 2, 0, 6] },
  label: { color: '#475569', bold: true },
  tableHeader: { bold: true, fontSize: 11, color: '#0f172a' },
  tableNumber: { alignment: 'right', fontSize: 10, color: '#0f172a' },
  small: { fontSize: 9, color: '#475569' },
};

const buildBrandedDefinition = (content, options = {}) => ({
  pageSize: 'A4',
  pageMargins: [
    SIDE_MARGIN,
    HEADER_HEIGHT + HEADER_MARGIN_BELOW,
    SIDE_MARGIN,
    BOTTOM_MARGIN + FOOTER_HEIGHT,
  ],
  header: (currentPage, pageCount, pageSize) => buildHeader(pageSize),
  footer: (currentPage, pageCount, pageSize) => buildFooter(pageSize),
  defaultStyle: { fontSize: 10, lineHeight: 1.35, color: '#0f172a' },
  styles: baseStyles,
  ...options,
  content,
});

export {
  BRAND_RED,
  FOOTER_HEIGHT,
  FOOTER_TEXT,
  HEADER_HEIGHT,
  SIDE_MARGIN,
  buildBrandedDefinition,
  loadPdfMake,
};
