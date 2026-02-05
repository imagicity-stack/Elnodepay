import Head from 'next/head';
import Image from 'next/image';

const Unauthorized = () => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-rose-50 via-white to-slate-50 font-poppins text-slate-800">
      <Head>
        <title>Access restricted · EL-NODE</title>
      </Head>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(163,31,54,0.12),transparent_26%),radial-gradient(circle_at_84%_10%,rgba(79,70,229,0.12),transparent_24%)]" aria-hidden="true" />

      <div className="relative mx-auto flex max-w-4xl flex-col gap-8 px-4 pb-12 pt-16 sm:pt-24 lg:px-0">
        <div className="flex items-center gap-3 self-start rounded-full border border-white/70 bg-white/90 px-4 py-2 shadow-lg backdrop-blur">
          <Image src="/elnode.png" alt="EL-NODE logo" width={36} height={36} />
          <div className="leading-tight">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cardinal">Secure workspace</p>
            <p className="text-[11px] text-slate-600">Admission Manager access</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-2xl backdrop-blur-xl">
          <div className="bg-gradient-to-r from-cardinal/10 via-white to-indigo-50 px-6 py-5">
            <h1 className="text-3xl font-semibold text-slate-900">Access restricted</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              This portal is reserved for team members with the <span className="font-semibold">admission_manager</span> role.
              Stay assured—your other sections remain safe and personalised.
            </p>
          </div>

          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-inner">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Why am I seeing this?</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cardinal" aria-hidden="true" />
                  <span>Your sign-in was successful but this area requires elevated privileges.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
                  <span>Different tabs and sub-sections surface automatically once your role is updated.</span>
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-inner">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Next steps</p>
              <div className="mt-3 space-y-3 text-sm text-slate-700">
                <div className="rounded-xl border border-cardinal/20 bg-cardinal/5 p-3">
                  <p className="font-semibold text-cardinal">Request access</p>
                  <p className="text-slate-600">Reach out to your administrator to enable the admission_manager role.</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-800">Return to other portals</p>
                  <p className="text-slate-600">Navigate back to Accountant, Staff, or Parent sections from the main dashboard.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white/80 px-6 py-4 text-xs font-semibold text-slate-600">
            <span>Designed for premium, mobile-ready navigation.</span>
            <span className="text-cardinal">Need help? Contact your administrator.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;
