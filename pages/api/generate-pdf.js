import chromium from '@sparticuz/chromium-min';
import puppeteerCore from 'puppeteer-core';
import { buildPdfDocument } from '../../lib/pdfTemplates';

const isServerless = Boolean(process.env.AWS_REGION || process.env.VERCEL);

const launchBrowser = async () => {
  if (isServerless) {
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  const puppeteer = (await import('puppeteer')).default;
  return puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let browser;
  try {
    const { type, payload } = req.body || {};
    const document = buildPdfDocument(type, payload);

    if (!document) {
      return res.status(400).json({ error: 'Invalid PDF request' });
    }

    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setContent(document.html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${document.fileName || 'document.pdf'}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error', error);
    return res.status(500).json({ error: 'Unable to generate PDF. Please try again.' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
