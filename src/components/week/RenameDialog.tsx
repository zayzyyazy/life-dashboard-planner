import { useState } from "react";

type Props = {
  title: string;
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function RenameDialog({ title, initialValue, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onConfirm(value.trim());
          }}
        />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!value.trim()}
            onClick={() => onConfirm(value.trim())}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
