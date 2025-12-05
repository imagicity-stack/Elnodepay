const NotificationsPanel = ({ notifications = [], onDismiss }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Notifications</h3>
        <span className="text-xs font-semibold text-slate-500">Live</span>
      </div>
      <div className="mt-4 space-y-2">
        {notifications.map((notification) => (
          <div key={notification.id} className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
              <p className="text-xs text-slate-500">{notification.message}</p>
            </div>
            {!notification.read && (
              <button
                type="button"
                onClick={() => onDismiss?.(notification.id)}
                className="text-xs font-semibold text-cardinal hover:underline"
              >
                Dismiss
              </button>
            )}
          </div>
        ))}
        {!notifications.length && <p className="text-sm text-slate-500">No notifications yet.</p>}
      </div>
    </div>
  );
};

export default NotificationsPanel;
