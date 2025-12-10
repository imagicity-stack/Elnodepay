let cachedTemplate = null;

const loadMasterTemplate = async () => {
  if (cachedTemplate) return cachedTemplate;
  const response = await fetch('/api/master-template');
  if (!response.ok) {
    throw new Error('Unable to load PDF template');
  }
  cachedTemplate = await response.text();
  return cachedTemplate;
};

export const wrapWithMasterTemplate = async (contentHtml) => {
  const template = await loadMasterTemplate();
  return template.replace('{{{content}}}', contentHtml);
};

export const renderPdfFromHtml = async ({ contentHtml, filename, margin = [20, 30, 30, 30] }) => {
  if (typeof window === 'undefined') return;
  const wrappedHtml = await wrapWithMasterTemplate(contentHtml);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const container = document.createElement('div');
  container.innerHTML = wrappedHtml;
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.zIndex = '-1';
  document.body.appendChild(container);

  await new Promise((resolve, reject) => {
    doc
      .html(container, {
        callback: (pdf) => {
          pdf.save(filename);
          document.body.removeChild(container);
          resolve();
        },
        html2canvas: { scale: 0.8 },
        margin,
        autoPaging: 'text',
        x: 0,
        y: 0,
        width: 555,
        windowWidth: 900,
      })
      .catch((error) => {
        document.body.removeChild(container);
        reject(error);
      });
  });
};

export const openPrintWindowWithTemplate = async ({ contentHtml, title = 'Document' }) => {
  if (typeof window === 'undefined') return;
  const wrappedHtml = await wrapWithMasterTemplate(contentHtml);
  const printable = window.open('', '_blank', 'width=900,height=1200');
  if (!printable) {
    throw new Error('Unable to open print window');
  }
  printable.document.open();
  printable.document.write(`<!DOCTYPE html><html>${wrappedHtml.replace('<body', `<head><title>${title}</title></head><body`)}`);
  printable.document.close();
  printable.focus();
  setTimeout(() => printable.print(), 400);
};
