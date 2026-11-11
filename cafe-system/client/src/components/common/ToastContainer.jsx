import React from 'react';
import { useSocket } from '../../context/SocketContext.jsx';
import { X, CheckCircle2, AlertTriangle, Info, BellRing } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = useSocket();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        let borderClass = 'border-amber-200 bg-amber-50 text-amber-900';
        let icon = <BellRing className="w-5 h-5 text-amber-600 flex-shrink-0" />;

        if (toast.type === 'success') {
          borderClass = 'border-emerald-200 bg-emerald-50 text-emerald-900';
          icon = <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />;
        } else if (toast.type === 'danger') {
          borderClass = 'border-rose-200 bg-rose-50 text-rose-900';
          icon = <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />;
        } else if (toast.type === 'info') {
          borderClass = 'border-blue-200 bg-blue-50 text-blue-900';
          icon = <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-2xl border shadow-xl flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200 ${borderClass}`}
          >
            {icon}
            <div className="flex-1">
              <h4 className="font-extrabold text-sm leading-tight">{toast.title}</h4>
              <p className="text-xs font-medium mt-0.5 opacity-90">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-lg hover:bg-black/5 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

