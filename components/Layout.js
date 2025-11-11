import Head from 'next/head';
import Header from './Header';
import Footer from './Footer';

const Layout = ({ title, children }) => {
  const pageTitle = title ? `${title} | EL-NODE Pay` : 'EL-NODE Pay';

  return (
    <div className="min-h-screen bg-white text-slate-900 font-poppins">
      <Head>
        <title>{pageTitle}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;
