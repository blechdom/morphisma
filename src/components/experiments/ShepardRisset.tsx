import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  shepardRissetGraph,
  type ShepardParams,
} from "@/synth/shepard-risset";
import * as engine from "@/audio/glissando-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";
import { Mermaid } from "@/components/Mermaid";

const STRIPES = [
  { color: "rgba(200,30,30,0.4)",    width: 44 },
  { color: "rgba(255,255,255,0.4)",  width: 44 },
  { color: "rgba(255,50,180,0.5)",   width: 12 },
  { color: "rgba(255,255,255,0.35)", width: 44 },
  { color: "rgba(220,50,50,0.4)",    width: 44 },
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

interface Preset {
  name: string;
  numVoices: number;
  speed: number;
  startFreq: number;
  intervalRatio: number;
  directionUp: boolean;
}

const PRESETS: Preset[] = [
  { name: "Classic Rise",      numVoices: 8,  speed: 0.05, startFreq: 100,  intervalRatio: 2.0,  directionUp: true },
  { name: "Classic Fall",      numVoices: 8,  speed: 0.05, startFreq: 200,  intervalRatio: 1.5,  directionUp: false },
  { name: "Tight Spiral",      numVoices: 2,  speed: 5.0,  startFreq: 135,  intervalRatio: 3.7,  directionUp: true },
  { name: "Micro Cluster",     numVoices: 8,  speed: 0.06, startFreq: 660,  intervalRatio: 0.12, directionUp: false },
  { name: "Wide Staircase",    numVoices: 6,  speed: 0.75, startFreq: 212,  intervalRatio: 4.0,  directionUp: true },
  { name: "Swarm",             numVoices: 64, speed: 0.15, startFreq: 80,   intervalRatio: 2.0,  directionUp: true },
  { name: "Screaming Descent", numVoices: 12, speed: 3.5,  startFreq: 2400, intervalRatio: 5.0,  directionUp: false },
  { name: "Sub Rumble",        numVoices: 32, speed: 0.02, startFreq: 25,   intervalRatio: 2.0,  directionUp: true },
  { name: "Glass Shatter",     numVoices: 16, speed: 8.0,  startFreq: 1200, intervalRatio: 1.05, directionUp: true },
  { name: "Alien Siren",       numVoices: 4,  speed: 2.0,  startFreq: 300,  intervalRatio: 7.0,  directionUp: false },
  { name: "Dense Cloud",       numVoices: 48, speed: 0.08, startFreq: 55,   intervalRatio: 3.0,  directionUp: true },
  { name: "Wobble Saw",        numVoices: 3,  speed: 6.5,  startFreq: 440,  intervalRatio: 0.5,  directionUp: false },
];

export function ShepardRisset() {
  const [playing, setPlaying] = useState(false);
  const [gain, setGain] = useState(0.0);
  const [params, setParams] = useState<ShepardParams>({
    numVoices: PRESETS[0].numVoices,
    speed: PRESETS[0].speed,
    startFreq: PRESETS[0].startFreq,
    intervalRatio: PRESETS[0].intervalRatio,
    directionUp: PRESETS[0].directionUp,
  });
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);

  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    engine.onScope((data) => {
      if (playingRef.current) setScopeData(data);
    });
    return () => {
      engine.suspend();
    };
  }, []);

  const buildAndRender = useCallback(() => {
    if (!playing) return;
    const dry = shepardRissetGraph(params);
    const gained = el.mul(
      dry,
      el.sm(el.const({ key: "main-gain", value: gain }))
    ) as NodeRepr_t;
    const scoped = el.scope({ name: "scope" }, gained);
    engine.render(scoped as NodeRepr_t);
  }, [playing, params, gain]);

  useEffect(() => {
    buildAndRender();
  }, [buildAndRender]);

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
    setParams({
      numVoices: p.numVoices,
      speed: p.speed,
      startFreq: p.startFreq,
      intervalRatio: p.intervalRatio,
      directionUp: p.directionUp,
    });
  };

  const set = <K extends keyof ShepardParams>(
    key: K,
    value: ShepardParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      <svg
        viewBox={`0 0 ${CANVAS} ${CANVAS}`}
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          zIndex: -1,
          pointerEvents: "none",
          transform: `rotate(${params.directionUp ? -45 : 45}deg) scale(1.6)`,
          transformOrigin: "center center",
        }}
      >
        {STRIPE_PATHS.map((s, i) => (
          <path key={i} d={s.d} fill={s.fill} />
        ))}
      </svg>
      <h1 className="site-title" style={{ color: "#ff4444" }}>Shepard-Risset Glissando</h1>

      <div className="transport">
        <button className="play-btn" onClick={togglePlay}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <div className="scope-wrap">
          <Oscilloscope data={scopeData} width={300} height={100} />
        </div>
      </div>

      <div className="controls">
        <Slider
          label="Gain"
          value={gain}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setGain(v)}
        />
        <Slider
          label="Voices"
          value={params.numVoices}
          min={1}
          max={64}
          step={1}
          onChange={(v) => set("numVoices", v)}
        />
        <Slider
          label="Speed"
          value={params.speed}
          min={0.01}
          max={10}
          step={0.01}
          onChange={(v) => set("speed", v)}
        />
        <Slider
          label="Start Freq"
          value={params.startFreq}
          min={10}
          max={3000}
          step={1}
          unit="Hz"
          onChange={(v) => set("startFreq", v)}
        />
        <Slider
          label="Interval Ratio"
          value={params.intervalRatio}
          min={0.01}
          max={8}
          step={0.01}
          onChange={(v) => set("intervalRatio", v)}
        />

        <div className="toggle-row">
          <span className="toggle-label">Direction</span>
          <button
            className={`toggle-btn ${params.directionUp ? "up" : "down"}`}
            onClick={() => set("directionUp", !params.directionUp)}
          >
            {params.directionUp ? "↑ Up" : "↓ Down"}
          </button>
        </div>
      </div>

      <div className="presets">
        <span className="presets-label">Presets</span>
        {PRESETS.map((p, i) => (
          <button
            key={i}
            className="preset-btn"
            onClick={() => applyPreset(p)}
            title={`${p.numVoices}v / ${p.speed} Hz / ${p.startFreq} Hz / ${p.intervalRatio}x`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <Mermaid chart={`graph TD
  P["phasor at speed Hz"] --> V0["Voice 0: phasor + offset"]
  P --> V1["Voice 1: phasor + offset"]
  P --> VN["Voice N: phasor + offset"]
  V0 --> F0["freq = startFreq x intervalRatio ^ phasor"]
  V1 --> F1["freq = startFreq x intervalRatio ^ phasor"]
  VN --> FN["freq = startFreq x intervalRatio ^ phasor"]
  F0 --> S0["el.cycle — sine oscillator"]
  F1 --> S1["el.cycle — sine oscillator"]
  FN --> SN["el.cycle — sine oscillator"]
  S0 -->|"x bell envelope"| SUM["Sum all voices"]
  S1 -->|"x bell envelope"| SUM
  SN -->|"x bell envelope"| SUM
  SUM -->|"x gain"| OUT["Output"]
`} />
    </div>
  );
}
