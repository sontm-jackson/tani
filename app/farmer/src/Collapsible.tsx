import { useState, type ReactNode } from "react";

// Accordion section: shows a one-line summary when closed, expands to edit.
export function Collapsible({ title, summary, defaultOpen = false, children }: {
  title: string; summary?: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`collapse card ${open ? "open" : ""}`}>
      <button className="collapse-head" onClick={() => setOpen((o) => !o)}>
        <span className="collapse-titles">
          <span className="collapse-title">{title}</span>
          {!open && summary && <span className="collapse-summary">{summary}</span>}
        </span>
        <span className="collapse-chev">›</span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}
