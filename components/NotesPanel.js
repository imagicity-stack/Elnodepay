const NotesPanel = ({ notes = [], onAdd }) => {
  const handleSubmit = (event) => {
    event.preventDefault();
    const note = event.target.note.value.trim();
    if (note) {
      onAdd?.(note);
      event.target.reset();
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Internal notes</h3>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <textarea
          name="note"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          placeholder="Add a note"
          rows={3}
        />
        <button
          type="submit"
          className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Add note
        </button>
      </form>
      <div className="mt-4 space-y-2">
        {notes.map((item, index) => (
          <div key={`${item.createdAt?.seconds || index}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-sm text-slate-800">{item.text}</p>
            <p className="mt-1 text-xs text-slate-500">
              {item.createdAt?.toDate?.()
                ? item.createdAt.toDate().toLocaleString('en-IN')
                : item.createdAt || 'Just now'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotesPanel;
