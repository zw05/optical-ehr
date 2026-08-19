'use client';

/** One menu button per queue row, so the actions column stays a single control. */
import { useEffect, useRef, useState } from 'react';

export interface OrderAction {
  label: string;
  run: () => void;
  /** Renders the item in the destructive tone, e.g. Remake. */
  danger?: boolean;
}

interface OrderActionsMenuProps {
  actions: OrderAction[];
  /** Named for screen readers, which hear every row's button out of context. */
  label: string;
}

export default function OrderActionsMenu({ actions, label }: OrderActionsMenuProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <span className="row-menu" ref={wrapperRef}>
      <button
        type="button"
        className="secondary row-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
        onClick={() => setOpen((current) => !current)}
      >
        Actions ▾
      </button>
      {open && (
        <div className="row-menu-list" role="menu">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={`row-menu-item${action.danger ? ' is-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                action.run();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
