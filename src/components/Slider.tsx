interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Power-law exponent. >1 gives more resolution near min (or zero for bipolar). Default 1 (linear). */
  curve?: number;
  onChange: (v: number) => void;
}

const INTERNAL_STEPS = 4000;

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  curve = 1,
  onChange,
}: SliderProps) {
  const useCurve = curve !== 1;
  const isBipolar = min < 0 && max > 0;
  const absMax = Math.max(Math.abs(min), max);
  const span = max - min;
  const internalStep = span / INTERNAL_STEPS;

  function posToValue(pos: number): number {
    if (isBipolar) {
      const sign = pos >= 0 ? 1 : -1;
      const norm = Math.abs(pos) / absMax;
      return sign * absMax * Math.pow(norm, curve);
    }
    const t = (pos - min) / span;
    return min + span * Math.pow(t, curve);
  }

  function valueToPos(val: number): number {
    if (isBipolar) {
      const sign = val >= 0 ? 1 : -1;
      const norm = Math.min(1, Math.abs(val) / absMax);
      return sign * absMax * Math.pow(norm, 1 / curve);
    }
    const t = Math.max(0, Math.min(1, (val - min) / span));
    return min + span * Math.pow(t, 1 / curve);
  }

  const sliderPos = useCurve ? valueToPos(value) : value;
  const sliderStep = useCurve ? internalStep : step;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = Number(e.target.value);
    if (useCurve) {
      const raw = posToValue(pos);
      const rounded = Math.round(raw / step) * step;
      onChange(Math.min(max, Math.max(min, rounded)));
    } else {
      onChange(pos);
    }
  };

  const decimals =
    step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const display = Number(value).toFixed(decimals);

  return (
    <div className="slider-row">
      <label className="slider-label">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={sliderStep}
        value={sliderPos}
        onChange={handleChange}
      />
      <span className="slider-value">
        {display}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
