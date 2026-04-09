import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  sandySyrupDelayGraph,
  MAX_VOICES,
  type SandySyrupDelayParams,
} from "@/synth/sandy-syrup-delay";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";
import { Mermaid } from "@/components/Mermaid";

type Source = "mic" | "file";

const STRIPES = [
  { color: "rgba(40,180,130,0.4)",   width: 44 },
  { color: "rgba(20,10,40,0.35)",    width: 44 },
  { color: "rgba(0,220,200,0.4)",    width: 12 },
  { color: "rgba(110,60,180,0.4)",   width: 44 },
  { color: "rgba(30,140,130,0.35)",  width: 44 },
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

const SPEED_LIMIT = 5;
const RANGE_MIN = 0.5;
const RANGE_MAX = 10;

interface Preset {
  name: string;
  speed: number;
  range: number;
  directionUp: boolean;
  numVoices: number;
  tilt: number;
  feedback: number;
  fbDelay: number;
  globalFeedback: number;
  dryWet: number;
  grainSize: number;
  blend: number;
}

const BUILT_IN_PRESETS: Preset[] = [
  { name: "Silk Rise",        speed: 0.08,  range: 4.0,  directionUp: true,  numVoices: 8,  tilt: 0,     feedback: 0.0,  fbDelay: 4.0,   globalFeedback: 0, dryWet: 0.85, grainSize: 0.05,  blend: 0.5 },
  { name: "Silk Fall",        speed: 0.08,  range: 4.0,  directionUp: false, numVoices: 8,  tilt: 0,     feedback: 0.0,  fbDelay: 4.0,   globalFeedback: 0, dryWet: 0.85, grainSize: 0.05,  blend: 0.5 },
  { name: "Pure Grit",        speed: 0.1,   range: 3.0,  directionUp: true,  numVoices: 8,  tilt: 0,     feedback: 0.0,  fbDelay: 4.0,   globalFeedback: 0, dryWet: 0.85, grainSize: 0.08,  blend: 0.0 },
  { name: "Pure Syrup",       speed: 0.1,   range: 3.0,  directionUp: true,  numVoices: 8,  tilt: 0,     feedback: 0.0,  fbDelay: 4.0,   globalFeedback: 0, dryWet: 0.85, grainSize: 0.08,  blend: 1.0 },
  { name: "Glacial Drift",    speed: 0.015, range: 8.0,  directionUp: true,  numVoices: 12, tilt: 0,     feedback: 0.75, fbDelay: 12.0,  globalFeedback: 0, dryWet: 1.0,  grainSize: 0.04,  blend: 0.7 },
  { name: "Robot Grind",      speed: 1.2,   range: 1.0,  directionUp: false, numVoices: 2,  tilt: -0.6,  feedback: 0.93, fbDelay: 2.0,   globalFeedback: 0, dryWet: 1.0,  grainSize: 0.015, blend: 0.0 },
  { name: "Grain Cloud",      speed: 0.1,   range: 3.0,  directionUp: true,  numVoices: 10, tilt: -0.3,  feedback: 0.3,  fbDelay: 5.0,   globalFeedback: 0, dryWet: 0.9,  grainSize: 0.3,   blend: 0.0 },
  { name: "Silk Glide",       speed: 0.05,  range: 6.0,  directionUp: false, numVoices: 12, tilt: 0,     feedback: 0.0,  fbDelay: 6.0,   globalFeedback: 0, dryWet: 0.8,  grainSize: 0.008, blend: 1.0 },
  { name: "Metal Shimmer",    speed: 0.6,   range: 1.0,  directionUp: true,  numVoices: 6,  tilt: 0.7,   feedback: 0.5,  fbDelay: 1.5,   globalFeedback: 0, dryWet: 0.7,  grainSize: 0.01,  blend: 0.3 },
  { name: "Feedback Drone",   speed: 0.03,  range: 2.0,  directionUp: true,  numVoices: 12, tilt: 0,     feedback: 0.92, fbDelay: 8.0,   globalFeedback: 0, dryWet: 1.0,  grainSize: 0.06,  blend: 0.6 },
  { name: "Full Spectrum",    speed: 0.04,  range: 10.0, directionUp: true,  numVoices: 12, tilt: 0,     feedback: 0.0,  fbDelay: 10.0,  globalFeedback: 0, dryWet: 1.0,  grainSize: 0.03,  blend: 0.8 },
  { name: "Gentle Blend",     speed: 0.12,  range: 2.0,  directionUp: false, numVoices: 6,  tilt: 0.2,   feedback: 0.2,  fbDelay: 3.0,   globalFeedback: 0, dryWet: 0.4,  grainSize: 0.06,  blend: 0.4 },
];

const ACCENT = "#20ccaa";

function deriveParams(
  speed: number,
  range: number,
  directionUp: boolean,
  rest: Omit<SandySyrupDelayParams, "speed" | "range" | "directionUp">
): SandySyrupDelayParams {
  return { ...rest, speed, range, directionUp };
}

export function SandySyrupDelay() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");

  const [speed, setSpeed] = useState(0.05);
  const [range, setRange] = useState(4.0);
  const [dirUp, setDirUp] = useState(true);
  const [numVoices, setNumVoices] = useState(8);
  const [tilt, setTilt] = useState(0);
  const [feedback, setFeedback] = useState(0.0);
  const [fbDelay, setFbDelay] = useState(4.0);
  const [globalFeedback, setGlobalFeedback] = useState(0.0);
  const [dryWet, setDryWet] = useState(0.8);
  const [inputGain, setInputGain] = useState(1.0);
  const [grainSize, setGrainSize] = useState(0.05);
  const [blend, setBlend] = useState(0.5);

  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [customPresets, setCustomPresets] = useState<Preset[]>(() => {
    try {
      const stored = localStorage.getItem("sandy-syrup-presets");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(playing);
  const sourceConnectedRef = useRef(false);
  playingRef.current = playing;

  const semitones = Math.round(range * 12);

  const params = deriveParams(speed, range, dirUp, {
    numVoices,
    tilt,
    feedback,
    fbDelay,
    globalFeedback,
    dryWet,
    inputGain,
    grainSize,
    blend,
  });

  useEffect(() => {
    engine.onScope((data) => {
      if (playingRef.current) setScopeData(data);
    });
    return () => {
      engine.disconnectSource();
      engine.suspend();
    };
  }, []);

  const buildAndRender = useCallback(() => {
    if (!playing) return;
    const sr = engine.getSampleRate();
    const graph = sandySyrupDelayGraph(params, sr);
    const gained = el.mul(
      graph,
      el.sm(el.const({ key: "output-vol", value: outputVol }))
    ) as NodeRepr_t;
    const scoped = el.scope({ name: "scope" }, gained);
    engine.render(scoped as NodeRepr_t);
  }, [playing, params, outputVol]);

  useEffect(() => {
    buildAndRender();
  }, [buildAndRender]);

  const connectSource = useCallback(
    async (src: Source) => {
      engine.disconnectSource();
      sourceConnectedRef.current = false;
      try {
        if (src === "mic") {
          await engine.connectMic();
          sourceConnectedRef.current = true;
        } else if (audioRef.current) {
          engine.connectFileElement(audioRef.current);
          sourceConnectedRef.current = true;
          audioRef.current.play();
        }
      } catch (err) {
        console.error("Failed to connect source:", err);
      }
    },
    [fileUrl]
  );

  const togglePlay = async () => {
    if (!playing) {
      await engine.ensureInitialized();
      await connectSource(source);
      engine.resume();
      setPlaying(true);
    } else {
      audioRef.current?.pause();
      engine.disconnectSource();
      sourceConnectedRef.current = false;
      engine.suspend();
      setPlaying(false);
      setScopeData([]);
    }
  };

  const handleSourceChange = async (newSource: Source) => {
    if (newSource === source) return;
    if (playing) {
      audioRef.current?.pause();
      await connectSource(newSource);
    }
    setSource(newSource);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const url = URL.createObjectURL(file);
    setFileUrl(url);
  };

  useEffect(() => {
    if (!audioRef.current || !fileUrl) return;
    audioRef.current.src = fileUrl;
    audioRef.current.load();
    if (playing && source === "file" && sourceConnectedRef.current) {
      audioRef.current.play();
    }
  }, [fileUrl]);

  const applyPreset = (p: Preset) => {
    setSpeed(p.speed);
    setRange(p.range);
    setDirUp(p.directionUp);
    setNumVoices(p.numVoices);
    setTilt(p.tilt);
    setFeedback(p.feedback);
    setFbDelay(p.fbDelay);
    setGlobalFeedback(p.globalFeedback);
    setDryWet(p.dryWet);
    setGrainSize(p.grainSize);
    setBlend(p.blend);
  };

  const startSaving = () => {
    setSavingPreset(true);
    setPresetName("");
    setTimeout(() => saveInputRef.current?.focus(), 0);
  };

  useEffect(() => {
    try { localStorage.setItem("sandy-syrup-presets", JSON.stringify(customPresets)); }
    catch {}
  }, [customPresets]);

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setCustomPresets((prev) => [
      ...prev,
      { name, speed, range, directionUp: dirUp, numVoices, tilt, feedback, fbDelay, globalFeedback, dryWet, grainSize, blend },
    ]);
    setSavingPreset(false);
    setPresetName("");
  };

  const deleteCustomPreset = (index: number) => {
    setCustomPresets((prev) => prev.filter((_, i) => i !== index));
  };

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  return (
    <div className="sandy-syrup-page">
      <style>{`
        .sandy-syrup-page input[type="range"]::-webkit-slider-thumb { background: ${ACCENT} !important; }
        .sandy-syrup-page input[type="range"]::-moz-range-thumb { background: ${ACCENT} !important; }
        .sandy-syrup-page .play-btn { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .sandy-syrup-page .play-btn:hover { background: ${ACCENT} !important; color: #0a0a0a !important; }
        .sandy-syrup-page .source-btn.active { background: ${ACCENT} !important; border-color: ${ACCENT} !important; }
      `}</style>
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
          transform: `rotate(${dirUp ? -45 : 45}deg) scale(1.6)`,
          transformOrigin: "center center",
        }}
      >
        {STRIPE_PATHS.map((s, i) => (
          <path key={i} d={s.d} fill={s.fill} />
        ))}
      </svg>
      <h1 className="site-title" style={{ color: ACCENT }}>
        Sandy Syrup Delay
      </h1>
      <p style={{ opacity: 0.7, marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        {numVoices} voices sweep through {fbDelay.toFixed(1)}s of buffered audio.
        Each grain locks a playback rate — from {(1 / Math.pow(2, range / 2)).toFixed(2)}× (pitch
        down) to {Math.pow(2, range / 2).toFixed(1)}× (pitch up) — and ramps the
        delay within the grain for true variable-speed playback. Two overlapping
        streams per voice sum to constant amplitude. The
        result: an endlessly {dirUp ? "rising" : "falling"} Shepard illusion, silky smooth.
      </p>

      <div className="source-bar">
        <span className="source-label">Source</span>
        <div className="source-buttons">
          <button
            className={`source-btn ${source === "mic" ? "active" : ""}`}
            onClick={() => handleSourceChange("mic")}
          >
            Mic
          </button>
          <button
            className={`source-btn ${source === "file" ? "active" : ""}`}
            onClick={() => handleSourceChange("file")}
          >
            File
          </button>
        </div>
        {source === "file" && (
          <label className="file-picker">
            <input type="file" accept="audio/*" onChange={handleFileChange} />
            <span>{fileUrl ? "Change file..." : "Choose audio file..."}</span>
          </label>
        )}
        {source === "mic" && (
          <span className="mic-hint">Use headphones to avoid feedback</span>
        )}
      </div>

      {source === "file" && fileUrl && (
        <audio ref={audioRef} loop crossOrigin="anonymous" />
      )}
      {source === "file" && !fileUrl && <audio ref={audioRef} />}

      <div className="transport">
        <button className="play-btn" style={{ opacity: 1, background: "transparent" }} onClick={togglePlay}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <div className="scope-wrap">
          <Oscilloscope data={scopeData} color={ACCENT} width={300} height={100} />
        </div>
      </div>

      <div className="presets">
        <span className="presets-label">Presets</span>
        {allPresets.map((p, i) => (
          <span key={i} style={{ position: "relative", display: "inline-block" }}>
            <button
              className="preset-btn"
              onClick={() => applyPreset(p)}
              title={`${p.speed} Hz / ${p.range} oct / ${p.numVoices}v / ${p.grainSize}s grain / ${p.blend.toFixed(1)} blend`}
            >
              {p.name}
            </button>
            {i >= BUILT_IN_PRESETS.length && (
              <button
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  border: "1px solid #444",
                  background: "#222",
                  color: "#888",
                  fontSize: "9px",
                  lineHeight: "1",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCustomPreset(i - BUILT_IN_PRESETS.length);
                }}
                title="Delete preset"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {savingPreset ? (
          <span style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
            <input
              ref={saveInputRef}
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePreset()}
              placeholder="name..."
              style={{
                width: "100px",
                padding: "0.3rem 0.5rem",
                fontSize: "0.75rem",
                border: "1px solid #555",
                borderRadius: "4px",
                background: "#1a1a1a",
                color: "#ccc",
                outline: "none",
              }}
            />
            <button className="preset-btn" onClick={savePreset}>Save</button>
            <button className="preset-btn" onClick={() => setSavingPreset(false)}>Cancel</button>
          </span>
        ) : (
          <button className="preset-btn" onClick={startSaving}>+ Save</button>
        )}
      </div>

      <div className="controls">
        <Slider
          label="Input Gain"
          value={inputGain}
          min={0}
          max={2}
          step={0.01}
          onChange={setInputGain}
        />
        <Slider
          label="Output Vol"
          value={outputVol}
          min={0}
          max={1}
          step={0.01}
          onChange={setOutputVol}
        />
        <Slider
          label="Voices"
          value={numVoices}
          min={1}
          max={MAX_VOICES}
          step={1}
          onChange={setNumVoices}
        />
        <Slider
          label="Grain Size"
          value={grainSize}
          min={0.005}
          max={0.5}
          step={0.001}
          unit="s"
          curve={2}
          onChange={setGrainSize}
        />
        <div className="slider-row">
          <label className="slider-label">Sand</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={blend}
            onChange={(e) => setBlend(parseFloat(e.target.value))}
          />
          <label className="slider-label" style={{ textAlign: "right" }}>Syrup</label>
        </div>
        <Slider
          label="Speed"
          value={speed}
          min={0}
          max={SPEED_LIMIT}
          step={0.001}
          unit="Hz"
          curve={2}
          onChange={(v) => setSpeed(v)}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            fontSize: "0.7rem",
            color: "#777",
            padding: "0 0 0 0.25rem",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={dirUp}
              onChange={(e) => setDirUp(e.target.checked)}
              style={{ accentColor: ACCENT }}
            />
            {dirUp ? "Up" : "Down"}
          </label>
          <span style={{ marginLeft: "auto", color: "#999", fontVariantNumeric: "tabular-nums" }}>
            ±{(range / 2).toFixed(1)} oct / {semitones > 0 ? "+" : ""}{semitones} st
          </span>
        </div>
        <Slider
          label="Octaves"
          value={range}
          min={RANGE_MIN}
          max={RANGE_MAX}
          step={0.1}
          unit="oct"
          curve={1}
          onChange={(v) => setRange(v)}
        />

        <Slider
          label="Tilt"
          value={tilt}
          min={-1}
          max={1}
          step={0.01}
          onChange={setTilt}
        />

        <Slider
          label="Feedback"
          value={feedback}
          min={0}
          max={0.95}
          step={0.01}
          onChange={setFeedback}
        />
        <Slider
          label="FB Delay"
          value={fbDelay}
          min={0.1}
          max={15}
          step={0.01}
          unit="s"
          curve={2}
          onChange={setFbDelay}
        />
        <Slider
          label="Global FB"
          value={globalFeedback}
          min={0}
          max={0.95}
          step={0.01}
          onChange={setGlobalFeedback}
        />
        <Slider
          label="Dry / Wet"
          value={dryWet}
          min={0}
          max={1}
          step={0.01}
          onChange={setDryWet}
        />
      </div>

      <Mermaid chart={`graph TD
  IN["Input -- mic / file"] -->|"x inputGain"| PLUS["(+) mix"]
  FB_RD -->|"x feedback"| PLUS
  PLUS --> BUF["toBuffer -- circular buffer"]
  BUF --> FB_RD["fbHead: read at fbDelay"]
  FB_RD -->|"x 0 -- SILENT"| SINK["fbSink"]
  BUF --> V0["Voice 0 -- phase 0/N"]
  BUF --> V1["Voice 1 -- phase 1/N"]
  BUF --> VN["Voice N -- phase N-1/N"]
  V0 -->|"x sweepHann"| SUM["Sum all voices"]
  V1 -->|"x sweepHann"| SUM
  VN -->|"x sweepHann"| SUM
  SUM -->|"x dryWet"| WET["Wet signal"]
  IN -->|"x 1 - dryWet"| DRY["Dry signal"]
  DRY --> OUT_MIX["(+) output mix"]
  WET --> OUT_MIX
  SINK --> OUT_MIX
  OUT_MIX --> OUT["Output"]
`} />
      <Mermaid chart={`graph TD
  subgraph "Per Voice -- Granular Detail"
    SW["sweepPhasor = phasor + i/N"] --> POS["basePosition = expCurve x fbDelay"]
    SW --> RATE["rate = 2^ octaves x phasor - 0.5 x dir"]
    POS --> SH_A["Stream A: S/H position + rate at grain boundary"]
    RATE --> SH_A
    POS --> SH_B["Stream B: S/H at +1/2 grain offset"]
    RATE --> SH_B
    SH_A --> RAMP_A["delayRamp = 1 - heldRate x grainPhasor x dur"]
    SH_B --> RAMP_B["delayRamp = 1 - heldRate x grainPhasor x dur"]
    RAMP_A --> RD_A["Read buffer at actualDelay"]
    RAMP_B --> RD_B["Read buffer at actualDelay"]
    RD_A -->|"x hannA"| OLA["Overlap-add: hannA + hannB = 1.0"]
    RD_B -->|"x hannB"| OLA
    OLA -->|"x sweepHann x voiceGain"| VOUT["Voice output"]
  end
`} />
    </div>
  );
}
