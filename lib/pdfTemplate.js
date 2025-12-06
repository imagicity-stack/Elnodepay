export const wrapWithMasterTemplate = (content = '') => {
  const template = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />

  <style>
    body {
      margin: 40px 50px;
      font-family: Arial, sans-serif;
      color: #222;
      font-size: 14px;
    }

    .header {
      display: flex;
      align-items: center;
      margin-bottom: 25px;
    }

    .logo {
      width: 120px;
      height: auto;
    }

    .divider {
      width: 100%;
      height: 2px;
      background: #444;
      margin: 20px 0;
      opacity: 0.5;
    }

    .content-area {
      margin-top: 10px;
      line-height: 1.6;
      font-size: 14px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 14px;
    }

    table th {
      text-align: left;
      padding: 8px;
      background: #f0f0f0;
      border-bottom: 1px solid #ccc;
    }

    table td {
      padding: 8px;
      border-bottom: 1px solid #ddd;
    }

    /* FULL-WIDTH RED STRIP FOOTER */
    .footer-wrapper {
      margin-left: -50px;
      margin-right: -50px;
      margin-top: 60px;
    }

    .footer {
      background: #8c191b;
      color: white;
      padding: 14px 50px;
      font-size: 12px;
      line-height: 1.45;
      width: 100%;
      text-align: left;  /* LEFT ALIGNED CONTENT */
      box-sizing: border-box;
    }

    .trust-line {
      margin-top: 3px;
      font-size: 11.5px;
      opacity: 0.95;
    }

  </style>
</head>

<body>

  <div class="header">
    <img src="/public/pdflogos.svg" class="logo" />
  </div>

  <div class="divider"></div>

  <div class="content-area">
    {{{content}}}
  </div>

  <div class="footer-wrapper">
    <div class="footer">
      The Elden Heights School | Opposite B.S.F Firing Range, Siwar, Hazaribagh 825317<br />
      CBSE Affiliation No. XXXXXXX | Contact: +91 9431904333 | www.eldenheights.org
      <div class="trust-line">
        A unit of Bhagwati Educational and Charitable Trust
      </div>
    </div>
  </div>

</body>
</html>
`;
  return template.replace('{{{content}}}', content);
};
