const Unauthorized = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-900">Unauthorized</h1>
        <p className="mt-2 text-sm text-slate-600">
          You do not have access to the Admission Manager Portal. Please contact the administrator to request the
          <span className="font-semibold"> admission_manager</span> role.
        </p>
      </div>
    </div>
  );
};

export default Unauthorized;
