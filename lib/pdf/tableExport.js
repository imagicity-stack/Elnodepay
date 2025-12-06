import { createBrandedPdf, PDF_BRAND } from './branding';

export const createTabularPdf = (jsPDFConstructor, { title, headers = [], rows = [] }) => {
  const { doc, contentBounds, addBrandedPage } = createBrandedPdf(jsPDFConstructor);
  let bounds = contentBounds;
  let y = bounds.startY;

  const columnWidth = bounds.width / Math.max(headers.length || 1, 1);

  const addPageAndHeader = () => {
    bounds = addBrandedPage();
    y = bounds.startY;
    drawTableHeader();
  };

  const ensureSpace = (height) => {
    if (y + height > bounds.maxY) {
      addPageAndHeader();
    }
  };

  doc.setFont(PDF_BRAND.headerFont, 'bold');
  doc.setFontSize(16);
  doc.text(title, bounds.left, y);
  y += 8;

  doc.setFont(PDF_BRAND.headerFont, 'normal');
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, bounds.left, y);
  y += 10;

  const drawTableHeader = () => {
    const headerHeight = 10;
    ensureSpace(headerHeight + 4);
    doc.setFillColor(248, 250, 252);
    doc.setTextColor(15, 23, 42);
    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.setFontSize(10);
    headers.forEach((header, index) => {
      const x = bounds.left + index * columnWidth;
      doc.rect(x, y, columnWidth, headerHeight, 'F');
      doc.text(header.label, x + 3, y + 6);
    });
    y += headerHeight;
  };

  const renderRow = (rowData) => {
    const cellLines = headers.map((header) => {
      const value = rowData[header.key] ?? '—';
      return doc.splitTextToSize(String(value), columnWidth - 6);
    });
    const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * 6 + 4;
    ensureSpace(rowHeight + 2);

    headers.forEach((header, index) => {
      const x = bounds.left + index * columnWidth;
      doc.setDrawColor(226, 232, 240);
      doc.rect(x, y, columnWidth, rowHeight, 'S');
      doc.setFont(PDF_BRAND.headerFont, 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      doc.text(cellLines[index], x + 3, y + 6);
    });
    y += rowHeight;
  };

  if (headers.length) {
    drawTableHeader();
  }

  if (!rows.length) {
    doc.text('No records available.', bounds.left, y + 8);
  } else {
    rows.forEach((row) => renderRow(row));
  }

  return doc;
};
