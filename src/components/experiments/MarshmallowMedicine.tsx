import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  marshmallowMedicineGraph,
  type MarshmallowParams,
  type ModMode,
} from "@/synth/marshmallow-medicine";
import * as engine from "@/audio/glissando-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";
import { Mermaid } from "@/components/Mermaid";

/* ── background ── */
const STRIPES = [
  { color: "rgba(255,180,210,0.4)", width: 44 },
  { color: "rgba(200,170,255,0.35)", width: 44 },
  { color: "rgba(255,255,255,0.45)", width: 12 },
  { color: "rgba(170,230,200,0.35)", width: 44 },
  { color: "rgba(240,160,190,0.4)", width: 44 },
];
const CANVAS = 3000;
const SINE_AMP = 14;
const SINE_PERIOD = 260;
const PATH_STEPS = 80;

function sineStripePath(topY: number, height: number): string {
  const botY = topY + height;
  let d = "";
  for (let s = 0; s <= PATH_STEPS; s++) {
    const x = (s / PATH_STEPS) * CANVAS;
    const y = topY + SINE_AMP * Math.sin((2 * Math.PI * x) / SINE_PERIOD);
    d += s === 0 ? `M${x},${y}` : `L${x},${y}`;
  }
  for (let s = PATH_STEPS; s >= 0; s--) {
    const x = (s / PATH_STEPS) * CANVAS;
    const y = botY + SINE_AMP * Math.sin((2 * Math.PI * x) / SINE_PERIOD);
    d += `L${x},${y}`;
  }
  return d + "Z";
}

const STRIPE_PATHS: { d: string; fill: string }[] = [];
{
  let y = 0;
  while (y < CANVAS) {
    for (const { color, width } of STRIPES) {
      if (y >= CANVAS) break;
      STRIPE_PATHS.push({ d: sineStripePath(y, width), fill: color });
      y += width;
    }
  }
}

const ACCENT = "#dd88cc";

const MODE_INFO: Record<ModMode, { label: string; short: string; desc: string; depthLabel: string; depthUnit: string; depthMax: number; depthStep: number }> = {
  fm: {
    label: "FM",
    short: "Frequency Modulation",
    desc: "Each Shepard voice is a sine LFO sweeping through octaves. It modulates the carrier\u2019s instantaneous frequency. As the LFO rates spiral upward, the FM sidebands shift — harmonics that seem to endlessly rise (or fall). Depth = Hz deviation.",
    depthLabel: "Deviation",
    depthUnit: "Hz",
    depthMax: 2000,
    depthStep: 1,
  },
  pm: {
    label: "PM",
    short: "Phase Modulation",
    desc: "Same Shepard sine LFOs, but they modulate the carrier\u2019s phase directly. Unlike FM, the modulation index stays constant regardless of modulator frequency — so high-rate LFO voices produce wider sideband spread. Depth = modulation index (radians).",
    depthLabel: "Mod Index",
    depthUnit: "rad",
    depthMax: 20,
    depthStep: 0.1,
  },
};

interface Preset {
  name: string;
  mode: ModMode;
  numVoices: number;
  sweepSpeed: number;
  minRate: number;
  octaves: number;
  directionUp: boolean;
  depth: number;
  carrierFreq: number;
}

const PRESETS: Preset[] = [
  // FM
  { name: "Slow Spiral",     mode: "fm", numVoices: 8,  sweepSpeed: 0.03, minRate: 1,   octaves: 3, directionUp: true,  depth: 80,   carrierFreq: 200 },
  { name: "Bright Ascent",   mode: "fm", numVoices: 10, sweepSpeed: 0.05, minRate: 2,   octaves: 4, directionUp: true,  depth: 200,  carrierFreq: 440 },
  { name: "Deep Drone",      mode: "fm", numVoices: 8,  sweepSpeed: 0.015,minRate: 0.5, octaves: 3, directionUp: true,  depth: 40,   carrierFreq: 80  },
  { name: "Falling Siren",   mode: "fm", numVoices: 8,  sweepSpeed: 0.06, minRate: 4,   octaves: 4, directionUp: false, depth: 300,  carrierFreq: 600 },
  { name: "Sub Throb",       mode: "fm", numVoices: 6,  sweepSpeed: 0.02, minRate: 0.25,octaves: 2, directionUp: true,  depth: 20,   carrierFreq: 55  },
  { name: "Harsh Climb",     mode: "fm", numVoices: 12, sweepSpeed: 0.08, minRate: 5,   octaves: 4, directionUp: true,  depth: 600,  carrierFreq: 300 },
  // PM
  { name: "Glass Rising",    mode: "pm", numVoices: 8,  sweepSpeed: 0.03, minRate: 1,   octaves: 4, directionUp: true,  depth: 2,    carrierFreq: 440 },
  { name: "Metal Spiral",    mode: "pm", numVoices: 10, sweepSpeed: 0.05, minRate: 2,   octaves: 3, directionUp: true,  depth: 6,    carrierFreq: 200 },
  { name: "Crystal Bell",    mode: "pm", numVoices: 6,  sweepSpeed: 0.04, minRate: 1,   octaves: 3, directionUp: false, depth: 1.5,  carrierFreq: 880 },
  { name: "Dark Descent",    mode: "pm", numVoices: 8,  sweepSpeed: 0.025,minRate: 0.5, octaves: 4, directionUp: false, depth: 4,    carrierFreq: 150 },
  { name: "Phase Storm",     mode: "pm", numVoices: 12, sweepSpeed: 0.07, minRate: 3,   octaves: 4, directionUp: true,  depth: 12,   carrierFreq: 330 },
  { name: "Soft Shimmer",    mode: "pm", numVoices: 8,  sweepSpeed: 0.02, minRate: 0.5, octaves: 2, directionUp: true,  depth: 0.8,  carrierFreq: 660 },
];

export function MarshmallowMedicine() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.35);

  const [mode, setMode] = useState<ModMode>("fm");
  const [numVoices, setNumVoices] = useState(8);
  const [sweepSpeed, setSweepSpeed] = useState(0.03);
  const [minRate, setMinRate] = useState(1);
  const [octaves, setOctaves] = useState(3);
  const [directionUp, setDirectionUp] = useState(true);
  const [depth, setDepth] = useState(80);
  const [carrierFreq, setCarrierFreq] = useState(200);

  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const info = MODE_INFO[mode];

  const params: MarshmallowParams = {
    mode, numVoices, sweepSpeed, minRate, octaves, directionUp, depth, carrierFreq,
  };

  useEffect(() => {
    engine.onScope((data) => {
      if (playingRef.current) setScopeData(data);
    });
    return () => { engine.suspend(); };
  }, []);

  const buildAndRender = useCallback(() => {
    if (!playing) return;
    const graph = marshmallowMedicineGraph(params);
    const gained = el.mul(
      graph,
      el.sm(el.const({ key: "mm-vol", value: outputVol }))
    ) as NodeRepr_t;
    const scoped = el.scope({ name: "scope" }, gained);
    engine.render(scoped as NodeRepr_t);
  }, [playing, params, outputVol]);

  useEffect(() => { buildAndRender(); }, [buildAndRender]);

  const togglePlay = async () => {
    if (!playing) {
      await engine.ensureInitialized();
      engine.resume();
      setPlaying(true);
    } else {
      engine.suspend();
      setPlaying(false);
      setScopeData([]);
    }
  };

  const applyPreset = (p: Preset) => {
    setMode(p.mode);
    setNumVoices(p.numVoices);
    setSweepSpeed(p.sweepSpeed);
    setMinRate(p.minRate);
    setOctaves(p.octaves);
    setDirectionUp(p.directionUp);
    setDepth(p.depth);
    setCarrierFreq(p.carrierFreq);
  };

  return (
    <div className="marshmallow-page">
      <style>{`
        .marshmallow-page input[type="range"]::-webkit-slider-thumb { background: ${ACCENT} !important; }
        .marshmallow-page input[type="range"]::-moz-range-thumb { background: ${ACCENT} !important; }
        .marshmallow-page .play-btn { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .marshmallow-page .play-btn:hover { background: ${ACCENT} !important; color: #0a0a0a !important; }
        .marshmallow-page .mode-btn {
          padding: 0.5rem 1.2rem; font-size: 0.85rem; border-radius: 4px;
          border: 1px solid #555; background: transparent; color: #aaa;
          cursor: pointer; transition: all 0.15s; font-weight: 500;
        }
        .marshmallow-page .mode-btn:hover { border-color: ${ACCENT}; color: ${ACCENT}; }
        .marshmallow-page .mode-btn.active {
          background: ${ACCENT}; border-color: ${ACCENT}; color: #0a0a0a; font-weight: 700;
        }
      `}</style>

      <svg
        viewBox={`0 0 ${CANVAS} ${CANVAS}`}
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: "fixed", inset: 0, width: "100vw", height: "100vh",
          zIndex: -1, pointerEvents: "none",
          transform: `rotate(${directionUp ? -45 : 45}deg) scale(1.6)`,
          transformOrigin: "center center",
        }}
      >
        {STRIPE_PATHS.map((s, i) => (
          <path key={i} d={s.d} fill={s.fill} />
        ))}
      </svg>

      <h1 className="site-title" style={{ color: ACCENT }}>Marshmallow Medicine</h1>
      <p style={{ color: "#ff6666", fontWeight: "bold", marginTop: "-0.5rem", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
        WORK-IN-PROGRESS
      </p>
      <p style={{ opacity: 0.7, marginTop: "0", marginBottom: "1.5rem" }}>
        FM and PM synthesis modulated by Shepard-tone LFOs. Each voice is a sine
        wave whose frequency sweeps through octaves with bell-curve fading —
        the same trick that makes Shepard tones sound like they rise forever,
        applied to modulation rate instead of pitch.
      </p>

      <div style={{ margin: "1rem 0" }}>
        <span className="slider-label" style={{ marginBottom: "0.5rem", display: "block" }}>MODE</span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(Object.keys(MODE_INFO) as ModMode[]).map((m) => (
            <button key={m} className={`mode-btn ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>
              {MODE_INFO[m].label}
            </button>
          ))}
        </div>
        <p style={{ opacity: 0.6, fontSize: "0.78rem", marginTop: "0.5rem", lineHeight: 1.5 }}>
          <strong style={{ color: ACCENT }}>{info.short}</strong> — {info.desc}
        </p>
      </div>

      <div className="presets">
        <span className="presets-label">Presets</span>
        {PRESETS.map((p, i) => (
          <button key={i} className="preset-btn" onClick={() => applyPreset(p)}
            title={`${p.mode.toUpperCase()} / ${p.carrierFreq}Hz / ${p.numVoices}v / ${p.minRate}–${(p.minRate * Math.pow(2, p.octaves)).toFixed(0)}Hz / ${p.directionUp ? "up" : "down"}`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="transport">
        <button className="play-btn" style={{ opacity: 1, background: "transparent" }} onClick={togglePlay}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <div className="scope-wrap">
          <Oscilloscope data={scopeData} color={ACCENT} width={300} height={100} />
        </div>
      </div>

      <div className="controls">
        <div style={{ marginBottom: "0.25rem", opacity: 0.5, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Carrier
        </div>
        <Slider label="Carrier Freq" value={carrierFreq} min={20} max={2000} step={1} unit="Hz" curve={2} onChange={setCarrierFreq} />
        <Slider label={info.depthLabel} value={depth} min={0} max={info.depthMax} step={info.depthStep} unit={info.depthUnit} onChange={setDepth} />
        <Slider label="Output Vol" value={outputVol} min={0} max={1} step={0.01} onChange={setOutputVol} />

        <div style={{ marginTop: "0.75rem", marginBottom: "0.25rem", opacity: 0.5, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Shepard LFO Sweep
        </div>
        <Slider label="Voices" value={numVoices} min={2} max={16} step={1} onChange={setNumVoices} />
        <Slider label="Sweep Speed" value={sweepSpeed} min={0.005} max={0.3} step={0.005} unit="Hz" curve={2} onChange={setSweepSpeed} />
        <Slider label="Min Rate" value={minRate} min={0.1} max={50} step={0.1} unit="Hz" curve={2} onChange={setMinRate} />
        <Slider label="Octaves" value={octaves} min={1} max={5} step={0.5} onChange={setOctaves} />
        <div className="toggle-row">
          <span className="toggle-label">Direction</span>
          <button className={`toggle-btn ${directionUp ? "up" : "down"}`} onClick={() => setDirectionUp(!directionUp)}>
            {directionUp ? "↑ Rising" : "↓ Falling"}
          </button>
        </div>
      </div>

      <Mermaid chart={`graph TD
  SWEEP["Master sweep phasor"] -->|"+offset₀"| P0["p₀ → rate₀ = min × 2^(p₀ × oct)"]
  SWEEP -->|"+offset₁"| P1["p₁ → rate₁"]
  SWEEP -->|"+offsetₙ"| PN["pₙ → rateₙ"]
  P0 -->|"sin(rate₀)"| M0["LFO₀"]
  P1 -->|"sin(rate₁)"| M1["LFO₁"]
  PN -->|"sin(rateₙ)"| MN["LFOₙ"]
  CAR["Carrier freq"] --> FM0["FM/PM carrier₀"]
  CAR --> FM1["FM/PM carrier₁"]
  CAR --> FMN["FM/PM carrierₙ"]
  M0 -->|"modulate"| FM0
  M1 -->|"modulate"| FM1
  MN -->|"modulate"| FMN
  FM0 -->|"× bell₀"| SUM["Sum → tanh"]
  FM1 -->|"× bell₁"| SUM
  FMN -->|"× bellₙ"| SUM
  SUM --> OUT["Output"]
`} />
      <div style={{ opacity: 0.5, fontSize: "0.7rem", marginTop: "0.5rem" }}>
        <p>
          <strong>FM</strong>: carrier frequency ±{" "}
          <em>depth</em> × sin(LFO). As the LFO rate spirals upward, the
          effective modulation index (β = Δf / f_mod) decreases — harmonics
          naturally thin out at high rates, thicken at low rates.
        </p>
        <p>
          <strong>PM</strong>: carrier phase + <em>index</em> × sin(LFO).
          The index is constant regardless of LFO rate — so high-rate voices
          produce wider bandwidth, low-rate voices produce narrower. Opposite
          spectral character to FM.
        </p>
      </div>
    </div>
  );
}
