import { createBrandedPdf, drawDivider, drawSectionHeading, PDF_BRAND } from './branding';

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

  drawSectionHeading(doc, { ...bounds, startY: y }, title || 'Report', 'Generated PDF export');
  y += 14;

  doc.setFont(PDF_BRAND.headerFont, 'normal');
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, bounds.left, y);
  y += 8;
  drawDivider(doc, bounds, y);
  y += 6;

  const drawTableHeader = () => {
    const headerHeight = 10;
    ensureSpace(headerHeight + 4);
    doc.setFillColor(PDF_BRAND.softAccent);
    doc.setDrawColor(PDF_BRAND.strokeMuted);
    doc.setLineWidth(0.6);
    doc.rect(bounds.left - 1, y - 2, bounds.width + 2, headerHeight + 4, 'FD');
    doc.setTextColor(15, 23, 42);
    doc.setFont(PDF_BRAND.headerFont, 'bold');
    doc.setFontSize(10);
    headers.forEach((header, index) => {
      const x = bounds.left + index * columnWidth;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(PDF_BRAND.strokeMuted);
      doc.roundedRect(x, y, columnWidth, headerHeight, 1.5, 1.5, 'FD');
      doc.text(header.label, x + 3, y + 6);
    });
    y += headerHeight + 2;
  };

  const renderRow = (rowData) => {
    const cellLines = headers.map((header) => {
      const value = rowData[header.key] ?? '—';
      return doc.splitTextToSize(String(value), columnWidth - 6);
    });
    const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * 6 + 6;
    ensureSpace(rowHeight + 4);

    const isStriped = rows.indexOf(rowData) % 2 === 1;
    if (isStriped) {
      doc.setFillColor(PDF_BRAND.softAccent);
      doc.rect(bounds.left - 1, y - 1, bounds.width + 2, rowHeight + 2, 'F');
    }

    headers.forEach((header, index) => {
      const x = bounds.left + index * columnWidth;
      doc.setDrawColor(PDF_BRAND.strokeMuted);
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
