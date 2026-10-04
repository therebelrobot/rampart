import { type ReactNode, useId } from "react";

interface SliderProps {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (nextValue: number) => void;
  formatValue?: (value: number) => string;
  hint?: string;
  /** CSS background for the track, e.g. a hue gradient */
  trackBackground?: string;
}

export function Slider({ label, value, minimum, maximum, step, onChange, formatValue, hint, trackBackground }: SliderProps) {
  const inputId = useId();
  return (
    <div className="field">
      <div className="field-row">
        <label htmlFor={inputId}>{label}</label>
        <output htmlFor={inputId} className="field-value">{formatValue ? formatValue(value) : value}</output>
      </div>
      <input
        id={inputId}
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={trackBackground ? ({ "--track-background": trackBackground } as React.CSSProperties) : undefined}
        className={trackBackground ? "slider has-track" : "slider"}
      />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (nextChecked: boolean) => void;
  hint?: string;
}

export function Toggle({ label, checked, onChange, hint }: ToggleProps) {
  const inputId = useId();
  return (
    <div className="field">
      <label className="toggle" htmlFor={inputId}>
        <input id={inputId} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
        <span>{label}</span>
      </label>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface SegmentedProps<OptionValue extends string | number> {
  label: string;
  value: OptionValue | null;
  options: { value: OptionValue; label: string; title?: string }[];
  onChange: (nextValue: OptionValue) => void;
}

export function Segmented<OptionValue extends string | number>({ label, value, options, onChange }: SegmentedProps<OptionValue>) {
  return (
    <div className="field" role="group" aria-label={label}>
      <div className="field-row"><span className="field-label">{label}</span></div>
      <div className="segmented">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={option.value === value ? "segment is-active" : "segment"}
            aria-pressed={option.value === value}
            title={option.title}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {aside}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export function Icon({ name }: { name: "lock" | "unlock" | "dice" | "undo" | "redo" | "close" | "trash" | "share" | "download" | "library" | "copy" | "image" | "plus" }) {
  // 16×16 pixel-style icons drawn on a grid so they stay crisp
  const paths: Record<typeof name, string> = {
    lock: "M5 7V5a3 3 0 0 1 6 0v2h1v7H4V7h1zm2 0h2V5a1 1 0 0 0-2 0v2z",
    unlock: "M5 7V5a3 3 0 0 1 6 0h-2a1 1 0 0 0-2 0v2h5v7H4V7h1z",
    dice: "M2 2h12v12H2V2zm2 2v2h2V4H4zm6 0v2h2V4h-2zM7 7v2h2V7H7zm-3 3v2h2v-2H4zm6 0v2h2v-2h-2z",
    undo: "M6 3v2h4a4 4 0 0 1 0 8H5v-2h5a2 2 0 0 0 0-4H6v2L2 6l4-3z",
    redo: "M10 3v2H6a4 4 0 0 0 0 8h5v-2H6a2 2 0 0 1 0-4h4v2l4-3-4-3z",
    close: "M3 4l1-1 4 4 4-4 1 1-4 4 4 4-1 1-4-4-4 4-1-1 4-4-4-4z",
    trash: "M6 2h4v1h4v2H2V3h4V2zM3 6h10l-1 8H4L3 6z",
    share: "M7 2h2v7H7V2zM5 4l3-3 3 3H5zM3 7h2v5h6V7h2v7H3V7z",
    download: "M7 2h2v6h2l-3 4-3-4h2V2zM2 12h2v1h8v-1h2v3H2v-3z",
    library: "M2 2h3v12H2V2zm4 0h3v12H6V2zm4.2 1l2.8-.8 2.6 11-2.8.8L10.2 3z",
    copy: "M5 1h8v10H5V1zm2 2v6h4V3H7zM2 4h2v9h7v2H2V4z",
    image: "M2 3h12v10H2V3zm2 2v6h8V9l-2-2-3 3-1-1-2 2V5zm6 0h2v2h-2V5z",
    plus: "M7 2h2v5h5v2H9v5H7V9H2V7h5V2z",
  };
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" shapeRendering="crispEdges">
      <path d={paths[name]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export const hueGradient =
  "linear-gradient(90deg, #f00 0%, #ff0 16.67%, #0f0 33.33%, #0ff 50%, #00f 66.67%, #f0f 83.33%, #f00 100%)";
