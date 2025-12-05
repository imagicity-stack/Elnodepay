import { useState } from 'react';

const columns = [
  'new',
  'contacted',
  'follow_up',
  'visit_scheduled',
  'token_paid',
  'admitted',
  'closed',
];

const PipelineBoard = ({ data = {}, onMove, onOpen }) => {
  const [dragging, setDragging] = useState(null);

  const handleDrop = (status) => {
    if (dragging) {
      onMove?.(dragging, status);
      setDragging(null);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
      {columns.map((status) => (
        <div
          key={status}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(status)}
          className="min-h-[220px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div className="flex items-center justify-between pb-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{status.replace('_', ' ')}</h4>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
              {(data[status] || []).length}
            </span>
          </div>
          <div className="space-y-2">
            {(data[status] || []).map((card) => (
              <div
                key={card.id}
                draggable
                onDragStart={() => setDragging(card.id)}
                className="cursor-move rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm transition hover:bg-slate-100"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{card.studentName || 'Prospect'}</p>
                  <button
                    type="button"
                    onClick={() => onOpen?.(card.id)}
                    className="text-xs font-semibold text-cardinal hover:underline"
                  >
                    Open
                  </button>
                </div>
                <p className="text-xs text-slate-500">Parent: {card.parentName}</p>
                <p className="text-xs text-slate-500">Class: {card.classApplied}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PipelineBoard;
