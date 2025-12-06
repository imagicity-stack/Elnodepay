const SCHOOL_BRAND = 'The Elden Heights SchooL';
const FOOTER_TEXT =
  'The Elden Heights School | A unit of Bhagwati Educational And Charitable Trust | Opposite B.S.F Firing Range, Siwar, Hazaribagh 825317';
const FOOTER_SECOND_LINE =
  'CBSE Affiliation No. XXXXXXX | Contact: +91 9431904333 | www.eldenheights.org';

const escapeHtml = (value = '') =>
  `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
};

const formatCurrency = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const wrapWithShell = ({ title, subtitle = '', content }) => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      .header {
        height: 2in;
        background: white;
        padding: 0 1.5in 0.5in 1.5in;
        display: flex;
        align-items: flex-end;
        border-bottom: 2px solid #e2e8f0;
      }
      .brand {
        font-family: 'Times New Roman', 'Georgia', serif;
        font-size: 28px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 0.04em;
      }
      .subtitle { color: #475569; margin-top: 6px; font-size: 14px; }
      main {
        padding: 0.5in 1.5in 2.5in 1.5in;
        background: #f8fafc;
        min-height: calc(100vh - 3in);
      }
      h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: 0.01em; }
      h2 { margin: 0 0 6px; font-size: 16px; letter-spacing: 0.01em; }
      p { margin: 4px 0; }
      .meta { color: #475569; font-size: 12px; }
      .card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        padding: 16px;
        margin-bottom: 14px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 9999px;
        border: 1px solid #e2e8f0;
        background: #fff1f2;
        color: #9f1239;
        font-weight: 600;
        font-size: 12px;
      }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 10px 12px; text-align: left; font-size: 12px; }
      th { background: #0f172a; color: white; letter-spacing: 0.02em; }
      tr:nth-child(odd) td { background: #f8fafc; }
      tr:nth-child(even) td { background: #fff; }
      .footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 1in;
        background: #8c191b;
        color: white;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        padding: 0 1.5in;
        font-size: 11px;
        line-height: 1.4;
      }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
      .chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .highlight { color: #0f766e; font-weight: 700; }
      .badge { display: inline-block; padding: 4px 8px; border-radius: 10px; background: #ecfeff; color: #0f172a; font-weight: 600; }
      .list { margin: 8px 0 0; padding-left: 18px; color: #334155; }
    </style>
  </head>
  <body>
    <header class="header">
      <div>
        <div class="brand">${SCHOOL_BRAND}</div>
        ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
      </div>
    </header>
    <main>
      <div class="card">
        <h1>${escapeHtml(title)}</h1>
        ${content}
      </div>
    </main>
    <footer class="footer">
      <div>${FOOTER_TEXT}</div>
      <div>${FOOTER_SECOND_LINE}</div>
    </footer>
  </body>
</html>`;

const buildFeeCollection = (payload = {}) => {
  const { entries = [], filterSummary = 'No filters applied', generatedOn } = payload;
  const rows = entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.studentId || '')}</td>
          <td>${escapeHtml(entry.studentName || '')}</td>
          <td>${escapeHtml(entry.class || '')}${entry.section ? ` - ${escapeHtml(entry.section)}` : ''}</td>
          <td>${escapeHtml(entry.status || '-')}</td>
          <td>${escapeHtml(entry.feeCycle || '')}</td>
          <td>${escapeHtml(entry.session || '')}</td>
          <td>${escapeHtml(entry.term || '')}</td>
          <td>${formatDate(entry.dueDate)}</td>
          <td>${formatCurrency(entry.amount)}</td>
          <td>${formatCurrency(entry.balance)}</td>
          <td>${escapeHtml(entry.paymentMode || '')}</td>
          <td>${escapeHtml(entry.transactionId || '')}</td>
          <td>${escapeHtml(entry.parentPhone || '')}</td>
          <td>${escapeHtml(entry.parentEmail || '')}</td>
          <td>${entry.reminderSent ? 'Yes' : 'No'}</td>
          <td>${formatCurrency(entry.storeCharge)}</td>
        </tr>`
    )
    .join('');

  const content = `
    <p class="meta">Generated on ${formatDateTime(generatedOn)} · ${escapeHtml(filterSummary)}</p>
    <div class="card" style="margin-top:12px;">
      <table>
        <thead>
          <tr>
            <th>Student ID</th>
            <th>Name</th>
            <th>Class</th>
            <th>Status</th>
            <th>Cycle</th>
            <th>Session</th>
            <th>Term</th>
            <th>Due</th>
            <th>Amount</th>
            <th>Balance</th>
            <th>Mode</th>
            <th>Txn ID</th>
            <th>Parent Phone</th>
            <th>Parent Email</th>
            <th>Reminder</th>
            <th>Store</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="16">No entries available.</td></tr>'}</tbody>
      </table>
    </div>`;

  return { fileName: 'fee-collection-report.pdf', html: wrapWithShell({ title: 'Fee Collection Report', subtitle: 'Finance & Accounts', content }) };
};

const buildFeeHistory = (payload = {}) => {
  const { student = {}, entries = [], generatedOn } = payload;
  const paymentList = entries
    .map(
      (payment, index) => `
        <div class="card">
          <h2>Payment ${index + 1}</h2>
          <p class="meta">${formatDateTime(payment.date)} · ${escapeHtml(payment.mode || 'Online')}</p>
          <div class="grid">
            <div><strong>Amount</strong><p class="highlight">${formatCurrency(payment.amount)}</p></div>
            <div><strong>Transaction ID</strong><p>${escapeHtml(payment.transactionId || '—')}</p></div>
            <div><strong>Reference</strong><p>${escapeHtml(payment.reference || '—')}</p></div>
            <div><strong>Notes</strong><p>${escapeHtml(payment.notes || '—')}</p></div>
          </div>
          ${Array.isArray(payment.breakdown) && payment.breakdown.length
            ? `<div style="margin-top:10px;">
                <p class="meta">Breakdown</p>
                <ul class="list">
                  ${payment.breakdown
                    .map((item) => `<li><strong>${escapeHtml(item.label || 'Fee')}</strong> — ${formatCurrency(item.amount)}</li>`)
                    .join('')}
                </ul>
              </div>`
            : ''}
        </div>`
    )
    .join('');

  const content = `
    <div class="grid" style="margin-bottom:12px;">
      <div class="card">
        <h2>Student</h2>
        <p class="meta">${escapeHtml(student.class || '')}${student.section ? ` · ${escapeHtml(student.section)}` : ''}</p>
        <p><strong>${escapeHtml(student.name || 'Student')}</strong></p>
        <p>ID: <span class="pill">${escapeHtml(student.studentId || student.id || 'Unknown')}</span></p>
      </div>
      <div class="card">
        <h2>Snapshot</h2>
        <p class="meta">Generated on ${formatDateTime(generatedOn)}</p>
        <p>Total records: <span class="highlight">${entries.length}</span></p>
      </div>
    </div>
    ${paymentList || '<p class="meta">No payments recorded yet.</p>'}`;

  return {
    fileName: `fee-report-${(student.studentId || student.id || 'student').toString().replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.pdf`,
    html: wrapWithShell({ title: 'Payment History', subtitle: 'Student Fee Report', content }),
  };
};

const buildAdmissionsTable = (payload = {}) => {
  const { title = 'Admissions Report', headers = [], rows = [], generatedOn } = payload;
  const headerRow = headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join('');
  const bodyRows = rows
    .map(
      (row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header.key] ?? '')}</td>`).join('')}</tr>`
    )
    .join('');

  const content = `
    <p class="meta">Generated on ${formatDateTime(generatedOn)}</p>
    <div class="card" style="margin-top:12px;">
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows || `<tr><td colspan="${headers.length || 1}">No records available.</td></tr>`}</tbody>
      </table>
    </div>`;

  return { fileName: `${title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '') || 'admissions'}.pdf`, html: wrapWithShell({ title, subtitle: 'Admissions & Outreach', content }) };
};

const buildSalarySlip = (payload = {}) => {
  const { staff = {}, salary = {}, generatedOn, monthLabel = '' } = payload;
  const allowances = salary.allowancesSnapshot || {};
  const deductions = salary.deductionsSnapshot || {};
  const earnings = [
    { label: 'Basic Pay', amount: allowances.basicPay },
    { label: 'HRA', amount: allowances.hra },
    { label: 'DA', amount: allowances.da },
    { label: 'Special Allowance', amount: allowances.specialAllowance },
    { label: 'Conveyance', amount: allowances.conveyanceAllowance },
    { label: 'Medical', amount: allowances.medicalAllowance },
    ...(Array.isArray(allowances.otherAllowances) ? allowances.otherAllowances.map((item) => ({ label: item.label || 'Allowance', amount: item.amount })) : []),
    ...(Array.isArray(salary.extraPayments) ? salary.extraPayments.map((item) => ({ label: item.label, amount: item.amount })) : []),
    salary.overtimeAmount ? { label: 'Overtime', amount: salary.overtimeAmount } : null,
  ].filter(Boolean);
  const deductionsList = [
    { label: 'PF (Employee)', amount: deductions.pfEmployeeContribution },
    { label: 'PF (Employer)', amount: deductions.pfEmployerContribution },
    { label: 'ESI', amount: deductions.esiContribution },
    { label: 'Professional Tax', amount: deductions.professionalTax },
    { label: 'TDS', amount: deductions.tdsAmount },
    { label: 'Advance Recovery', amount: deductions.advanceRecoveryPerMonth },
    ...(Array.isArray(deductions.otherDeductions) ? deductions.otherDeductions.map((item) => ({ label: item.label, amount: item.amount })) : []),
    salary.penaltiesAmount ? { label: 'Penalties', amount: salary.penaltiesAmount } : null,
  ].filter(Boolean);

  const earningsHtml = earnings
    .map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${formatCurrency(item.amount)}</td></tr>`)
    .join('');
  const deductionsHtml = deductionsList
    .map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${formatCurrency(item.amount)}</td></tr>`)
    .join('');

  const content = `
    <div class="grid" style="margin-bottom:12px;">
      <div class="card">
        <h2>${escapeHtml(staff.fullName || 'Staff Member')}</h2>
        <p class="meta">${escapeHtml(staff.designationCategory || '')}${staff.subRole ? ` · ${escapeHtml(staff.subRole)}` : ''}</p>
        <p>Staff ID: <span class="pill">${escapeHtml(staff.staffId || '')}</span></p>
        <p class="meta">Processed on ${formatDateTime(salary.processedAt || generatedOn)}</p>
      </div>
      <div class="card">
        <h2>Salary Summary</h2>
        <p class="meta">${escapeHtml(monthLabel || '')}</p>
        <p>Gross Salary: <span class="highlight">${formatCurrency(salary.grossSalary)}</span></p>
        <p>Total Deductions: <span class="highlight">${formatCurrency(salary.totalDeductions)}</span></p>
        <p style="margin-top:8px; font-size:15px; font-weight:700; color:#065f46;">Net Payable: ${formatCurrency(salary.netPayable)}</p>
        <p class="meta">Status: ${escapeHtml(salary.paymentStatus || 'Pending')}</p>
      </div>
    </div>
    <div class="grid">
      <div class="card">
        <h2>Earnings</h2>
        <table>
          <tbody>${earningsHtml || '<tr><td>No earnings recorded.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card">
        <h2>Deductions</h2>
        <table>
          <tbody>${deductionsHtml || '<tr><td>No deductions recorded.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;

  return {
    fileName: `salary-slip-${(staff.staffId || staff.fullName || 'staff').toString().replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-${monthLabel.replace(/\s+/g, '-').toLowerCase()}.pdf`,
    html: wrapWithShell({ title: 'Salary Slip', subtitle: 'Staff Finance', content }),
  };
};

export const buildPdfDocument = (type, payload) => {
  switch (type) {
    case 'fee-collection':
      return buildFeeCollection(payload);
    case 'fee-history':
      return buildFeeHistory(payload);
    case 'admissions-table':
      return buildAdmissionsTable(payload);
    case 'salary-slip':
      return buildSalarySlip(payload);
    default:
      return null;
  }
};
