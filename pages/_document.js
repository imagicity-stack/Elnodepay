import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    const themeColor = '#A31F36';

    return (
      <Html lang="en">
        <Head>
          <meta name="application-name" content="ELNODE" />
          <meta name="theme-color" content={themeColor} />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="ELNODE" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="msapplication-starturl" content="/" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="icon" href="/elnode.png" />
          <link rel="apple-touch-icon" href="/elnode.png" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
