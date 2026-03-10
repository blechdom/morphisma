interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: SliderProps) {
  const display =
    step < 1 ? Number(value).toFixed(2) : String(Math.round(value));
  return (
    <div className="slider-row">
      <label className="slider-label">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider-value">
        {display}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
