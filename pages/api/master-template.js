import path from 'path';
import { promises as fs } from 'fs';

export default async function handler(req, res) {
  try {
    const templatePath = path.join(process.cwd(), 'functions', 'templates', 'master.html');
    const template = await fs.readFile(templatePath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).send(template);
  } catch (error) {
    console.error('Error loading master template', error);
    res.status(500).json({ error: 'Unable to load PDF template' });
  }
}
