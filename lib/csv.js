export function toCSV(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '';
  }

  const headerSet = new Set();
  rows.forEach((row) => {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach((key) => headerSet.add(key));
    }
  });

  const headers = Array.from(headerSet);
  if (headers.length === 0) {
    return '';
  }

  const escapeValue = (value) => {
    if (value === null || value === undefined) {
      return '';
    }
    let stringValue = value instanceof Date ? value.toISOString() : String(value);
    const needsEscaping = /[",\n]/.test(stringValue);
    if (needsEscaping) {
      stringValue = stringValue.replace(/"/g, '""');
      return `"${stringValue}"`;
    }
    return stringValue;
  };

  const lines = [headers.join(',')];
  rows.forEach((row) => {
    const line = headers.map((header) => escapeValue(row?.[header]));
    lines.push(line.join(','));
  });

  return lines.join('\n');
}
