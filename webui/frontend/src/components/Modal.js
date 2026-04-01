import React from 'react';

export default function Modal({
  open,
  title,
  children,
  onClose,
  actions,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-bg-secondary border border-border-accent rounded-lg w-[320px] shadow-lg">

        {/* Header */}
        <div className="px-4 py-2 border-b border-border-subtle text-sm font-semibold text-txt-primary">
          {title}
        </div>

        {/* Body */}
        <div className="p-4 text-xs text-txt-secondary">
          {children}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-2 border-t border-border-subtle">
          {actions}
        </div>

      </div>
    </div>
  );
}