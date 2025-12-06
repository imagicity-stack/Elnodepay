export const INCH_TO_MM = 25.4;
export const A4_WIDTH = 210;
export const A4_HEIGHT = 297;
export const HEADER_HEIGHT = 2 * INCH_TO_MM;
export const FOOTER_HEIGHT = 1 * INCH_TO_MM;
export const SIDE_MARGIN = 1.5 * INCH_TO_MM;
export const CONTENT_TOP_MARGIN = 0.5 * INCH_TO_MM;
export const CONTENT_WIDTH = A4_WIDTH - SIDE_MARGIN * 2;
export const CONTENT_START_Y = HEADER_HEIGHT + CONTENT_TOP_MARGIN;
export const INTRO_HEIGHT = 22;
export const INTRO_SPACING = 2;
export const BODY_START_Y = CONTENT_START_Y + INTRO_HEIGHT + INTRO_SPACING;
export const CONTENT_BOTTOM_MARGIN = 1.5 * INCH_TO_MM;
export const CONTENT_END_Y = A4_HEIGHT - FOOTER_HEIGHT - CONTENT_BOTTOM_MARGIN;
export const BODY_HEIGHT = CONTENT_END_Y - BODY_START_Y;
export const FOOTER_BAR_COLOR = '#8c191b';
export const FOOTER_TEXT =
  'The Elden Heights School | A unit of Bhagwati Educational And Charitable Trust | Opposite B.S.F Firing Range, Siwar, Hazaribagh 825317\nCBSE Affiliation No. XXXXXXX | Contact: +91 9431904333 | www.eldenheights.org';

export const HEADER_FONT = 'Times-Roman';
export const BODY_FONT = 'Helvetica';
export const MM_PER_POINT = 0.352778;
export const HEADER_FONT_SIZE = 22;
export const HEADER_SUB_FONT_SIZE = 14;
export const INTRO_FONT_SIZE = 11;
export const INTRO_LINE_HEIGHT = 1.35;
export const BODY_FONT_SIZE = 10;
export const BODY_LINE_HEIGHT = 1.4;
export const MAX_BODY_CHARACTERS = 90;

export const buildFooterBarSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${A4_WIDTH}mm" height="${FOOTER_HEIGHT}mm" viewBox="0 0 ${A4_WIDTH} ${FOOTER_HEIGHT}"><rect width="100%" height="100%" fill="${FOOTER_BAR_COLOR}" rx="0"/></svg>`;

export const getLinesPerPage = (lineHeightMultiplier = BODY_LINE_HEIGHT, fontSize = BODY_FONT_SIZE) => {
  const lineHeightMm = fontSize * lineHeightMultiplier * MM_PER_POINT;
  return Math.max(1, Math.floor(BODY_HEIGHT / lineHeightMm));
};

export const wrapText = (text, maxChars = MAX_BODY_CHARACTERS) => {
  const normalised = `${text || ''}`.trim();
  if (!normalised) return [''];
  const words = normalised.split(/\s+/);
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
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [''];
};

export const paginateLines = (lines, linesPerPage) => {
  if (!Array.isArray(lines) || lines.length === 0) return [[]];
  const chunks = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    chunks.push(lines.slice(i, i + linesPerPage));
  }
  return chunks.length ? chunks : [[]];
};

export const buildBaseSchema = () => {
  const bodyHeight = BODY_HEIGHT;
  return {
    headerTitle: {
      type: 'text',
      position: { x: SIDE_MARGIN, y: 12 },
      width: CONTENT_WIDTH,
      height: 16,
      fontSize: HEADER_FONT_SIZE,
      fontName: HEADER_FONT,
      color: '#000000',
      align: 'center',
    },
    headerSubtitle: {
      type: 'text',
      position: { x: SIDE_MARGIN, y: 32 },
      width: CONTENT_WIDTH,
      height: 12,
      fontSize: HEADER_SUB_FONT_SIZE,
      fontName: BODY_FONT,
      color: '#111827',
      align: 'center',
    },
    intro: {
      type: 'text',
      position: { x: SIDE_MARGIN, y: CONTENT_START_Y },
      width: CONTENT_WIDTH,
      height: INTRO_HEIGHT,
      fontSize: INTRO_FONT_SIZE,
      lineHeight: INTRO_LINE_HEIGHT,
      fontName: BODY_FONT,
      color: '#111827',
    },
    body: {
      type: 'text',
      position: { x: SIDE_MARGIN, y: BODY_START_Y },
      width: CONTENT_WIDTH,
      height: bodyHeight,
      fontSize: BODY_FONT_SIZE,
      lineHeight: BODY_LINE_HEIGHT,
      fontName: BODY_FONT,
      color: '#111827',
    },
    footerBar: {
      type: 'svg',
      position: { x: 0, y: A4_HEIGHT - FOOTER_HEIGHT },
      width: A4_WIDTH,
      height: FOOTER_HEIGHT,
    },
    footerText: {
      type: 'text',
      position: { x: SIDE_MARGIN, y: A4_HEIGHT - FOOTER_HEIGHT + 4 },
      width: CONTENT_WIDTH,
      height: FOOTER_HEIGHT - 6,
      fontSize: 8,
      lineHeight: 1.3,
      fontName: BODY_FONT,
      color: '#ffffff',
      align: 'center',
    },
  };
};
