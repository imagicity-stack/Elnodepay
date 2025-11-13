import { useEffect } from 'react';
import Head from 'next/head';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const existingRegistration = await navigator.serviceWorker.getRegistration('/sw.js');

        if (!existingRegistration) {
          await navigator.serviceWorker.register('/sw.js');
        }
      } catch (error) {
        console.error('Service worker registration failed', error);
      }
    };

    registerServiceWorker();
  }, []);

  return (
    <>
      <Head>
        <link rel="icon" href="/elnode.png" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
