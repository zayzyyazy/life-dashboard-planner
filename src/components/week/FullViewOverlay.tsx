import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
};

export function FullViewOverlay({ title, subtitle, onClose, children }: Props) {
  return (
    <div className="full-view-overlay">
      <div className="full-view-header">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {subtitle && (
            <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
              {subtitle}
            </p>
          )}
        </div>
        <button type="button" className="btn btn-sm" onClick={onClose}>
          Close full view
        </button>
      </div>
      <div className="full-view-body">{children}</div>
    </div>
  );
}
