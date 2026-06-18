import { useEffect, useRef, useState } from "react";

// Custom dropdown — replaces the native <select> for consistent cross-platform UI.
export function Select({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`sel ${open ? "open" : ""}`} ref={ref}>
      <button type="button" className="sel-trigger" onClick={() => setOpen((o) => !o)}>
        <span className={value ? "" : "sel-ph"}>{value || placeholder || "Select…"}</span>
        <svg className="sel-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="sel-menu">
          {options.map((opt) => (
            <button type="button" key={opt}
              className={`sel-opt ${opt === value ? "on" : ""}`}
              onClick={() => { onChange(opt); setOpen(false); }}>
              <span>{opt}</span>
              {opt === value && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
