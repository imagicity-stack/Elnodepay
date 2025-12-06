const INCH_TO_MM = 25.4;

export const PDF_BRAND = {
  headerHeight: 2 * INCH_TO_MM,
  contentSpacingBelowHeader: 0.5 * INCH_TO_MM,
  sideMargin: 1.5 * INCH_TO_MM,
  bottomMargin: 1.5 * INCH_TO_MM,
  footerHeight: 1 * INCH_TO_MM,
  footerColor: '#8c191b',
  headerFont: 'times',
  footerFont: 'times',
  headerTitle: 'The Elden Heights SchooL',
  footerText:
    ' The Elden Heights School | A unit of Bhagwati Educational And Charitable Trust | Opposite B.S.F Firing Range, Siwar, Hazaribagh 825317\n      CBSE Affiliation No. XXXXXXX | Contact: +91 9431904333 | www.eldenheights.org ',
};

export const createBrandedPdf = (jsPDFConstructor) => {
  const doc = new jsPDFConstructor({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const drawBranding = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, PDF_BRAND.headerHeight, 'F');

    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.setFontSize(26);
    doc.setTextColor(0, 0, 0);
    const headerY = PDF_BRAND.headerHeight / 2 + 4;
    doc.text(PDF_BRAND.headerTitle, pageWidth / 2, headerY, { align: 'center' });

    const footerY = pageHeight - PDF_BRAND.footerHeight;
    doc.setFillColor(PDF_BRAND.footerColor);
    doc.rect(0, footerY, pageWidth, PDF_BRAND.footerHeight, 'F');

    doc.setFont(PDF_BRAND.footerFont, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const footerLines = doc.splitTextToSize(PDF_BRAND.footerText.trim(), pageWidth - PDF_BRAND.sideMargin * 0.6);
    doc.text(footerLines, pageWidth / 2, footerY + PDF_BRAND.footerHeight / 2 + 2, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFont(PDF_BRAND.headerFont, 'normal');
  };

  const getContentBounds = () => ({
    left: PDF_BRAND.sideMargin,
    width: pageWidth - PDF_BRAND.sideMargin * 2,
    right: pageWidth - PDF_BRAND.sideMargin,
    startY: PDF_BRAND.headerHeight + PDF_BRAND.contentSpacingBelowHeader,
    maxY: pageHeight - PDF_BRAND.footerHeight - PDF_BRAND.bottomMargin,
  });

  drawBranding();
  let contentBounds = getContentBounds();

  const addBrandedPage = () => {
    doc.addPage();
    drawBranding();
    contentBounds = getContentBounds();
    return contentBounds;
  };

  const ensureSpace = (currentY, requiredSpace = 8) => {
    if (currentY + requiredSpace > contentBounds.maxY) {
      const bounds = addBrandedPage();
      return bounds.startY;
    }
    return currentY;
  };

  return { doc, pageWidth, pageHeight, contentBounds, addBrandedPage, ensureSpace };
};

export const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
