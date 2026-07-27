import { useEffect } from "react";
import { X } from "lucide-react";

export function Modal({ isOpen, onClose, title, children, panelClassName = "" }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-surface rounded-[10px] border border-border shadow-lg w-full max-w-md mx-4 max-h-[85vh] overflow-hidden p-6 flex flex-col ${panelClassName}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto pr-1">
          {children}
        </div>
      </div>
    </div>
  );
}
