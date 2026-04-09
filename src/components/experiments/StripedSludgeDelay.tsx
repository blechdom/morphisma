import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  stripedSludgeDelayGraph,
  MAX_VOICES,
  type StripedSludgeDelayParams,
} from "@/synth/striped-sludge-delay";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";
import { Mermaid } from "@/components/Mermaid";

type Source = "mic" | "file";

const STRIPES = [
  { color: "rgba(80,100,40,0.4)",    width: 44 },
  { color: "rgba(20,15,10,0.35)",    width: 44 },
  { color: "rgba(80,200,255,0.45)",   width: 12 },
  { color: "rgba(60,80,50,0.35)",    width: 44 },
  { color: "rgba(90,60,30,0.4)",     width: 44 },
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
const RANGE_MIN = 0.1;
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
}

const BUILT_IN_PRESETS: Preset[] = [
  { name: "Centered Rise",   speed: 0.5,   range: 2.0,   directionUp: true,  numVoices: 8,  tilt: 0,     feedback: 0.0,  fbDelay: 1.0,   globalFeedback: 0, dryWet: 0.8 },
  { name: "Centered Fall",   speed: 0.5,   range: 2.0,   directionUp: false, numVoices: 8,  tilt: 0,     feedback: 0.0,  fbDelay: 1.0,   globalFeedback: 0, dryWet: 0.8 },
  { name: "Slow Sludge",     speed: 0.1,   range: 4.0,   directionUp: true,  numVoices: 12, tilt: 0,     feedback: 0.7,  fbDelay: 3.0,   globalFeedback: 0, dryWet: 0.9 },
  { name: "Thick Tar",       speed: 0.08,  range: 6.0,   directionUp: false, numVoices: 12, tilt: -0.3,  feedback: 0.85, fbDelay: 4.0,   globalFeedback: 0, dryWet: 1.0 },
  { name: "Quick Stripe",    speed: 2.0,   range: 0.5,   directionUp: true,  numVoices: 4,  tilt: 0.5,   feedback: 0.4,  fbDelay: 0.5,   globalFeedback: 0, dryWet: 0.6 },
  { name: "Mud Churn",       speed: 0.3,   range: 3.0,   directionUp: false, numVoices: 10, tilt: 0.4,   feedback: 0.8,  fbDelay: 2.0,   globalFeedback: 0, dryWet: 0.85 },
  { name: "Dual Grind",      speed: 1.3,   range: 0.1,   directionUp: false, numVoices: 2,  tilt: -0.5,  feedback: 0.95, fbDelay: 0.01,  globalFeedback: 0, dryWet: 1.0 },
  { name: "Wide Sweep",      speed: 0.15,  range: 5.0,   directionUp: true,  numVoices: 12, tilt: 0,     feedback: 0.0,  fbDelay: 2.0,   globalFeedback: 0, dryWet: 0.85 },
  { name: "Frozen Bog",      speed: 0.02,  range: 8.0,   directionUp: true,  numVoices: 12, tilt: 0,     feedback: 0.9,  fbDelay: 5.0,   globalFeedback: 0, dryWet: 1.0 },
  { name: "Tight Wobble",    speed: 1.5,   range: 0.3,   directionUp: true,  numVoices: 6,  tilt: -0.4,  feedback: 0.5,  fbDelay: 0.2,   globalFeedback: 0, dryWet: 0.55 },
  { name: "Long Pour",       speed: 0.06,  range: 7.0,   directionUp: false, numVoices: 12, tilt: 0.2,   feedback: 0.75, fbDelay: 4.0,   globalFeedback: 0, dryWet: 0.95 },
  { name: "Gentle Ooze",     speed: 0.2,   range: 1.5,   directionUp: true,  numVoices: 8,  tilt: 0.2,   feedback: 0.3,  fbDelay: 1.0,   globalFeedback: 0, dryWet: 0.5 },
];

const ACCENT = "#8ca030";

function deriveParams(
  speed: number,
  range: number,
  directionUp: boolean,
  rest: Omit<StripedSludgeDelayParams, "speed" | "range" | "directionUp">
): StripedSludgeDelayParams {
  return { ...rest, speed, range, directionUp };
}

export function StripedSludgeDelay() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");

  const [speed, setSpeed] = useState(0.5);
  const [range, setRange] = useState(2.0);
  const [dirUp, setDirUp] = useState(true);
  const [numVoices, setNumVoices] = useState(8);
  const [tilt, setTilt] = useState(0);
  const [feedback, setFeedback] = useState(0.0);
  const [fbDelay, setFbDelay] = useState(1.0);
  const [globalFeedback, setGlobalFeedback] = useState(0.0);
  const [dryWet, setDryWet] = useState(0.8);
  const [inputGain, setInputGain] = useState(1.0);

  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [customPresets, setCustomPresets] = useState<Preset[]>(() => {
    try {
      const stored = localStorage.getItem("striped-sludge-presets");
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

  const pitchProduct = speed * range * Math.PI;
  const semitones = Math.round(12 * Math.log2(Math.max(1 + pitchProduct, 0.01)));

  const params = deriveParams(speed, range, dirUp, {
    numVoices,
    tilt,
    feedback,
    fbDelay,
    globalFeedback,
    dryWet,
    inputGain,
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
    const graph = stripedSludgeDelayGraph(params, sr);
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
  };

  const startSaving = () => {
    setSavingPreset(true);
    setPresetName("");
    setTimeout(() => saveInputRef.current?.focus(), 0);
  };

  useEffect(() => {
    try { localStorage.setItem("striped-sludge-presets", JSON.stringify(customPresets)); }
    catch {}
  }, [customPresets]);

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setCustomPresets((prev) => [
      ...prev,
      { name, speed, range, directionUp: dirUp, numVoices, tilt, feedback, fbDelay, globalFeedback, dryWet },
    ]);
    setSavingPreset(false);
    setPresetName("");
  };

  const deleteCustomPreset = (index: number) => {
    setCustomPresets((prev) => prev.filter((_, i) => i !== index));
  };

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  return (
    <div className="sludge-page">
      <style>{`
        .sludge-page input[type="range"]::-webkit-slider-thumb { background: ${ACCENT} !important; }
        .sludge-page input[type="range"]::-moz-range-thumb { background: ${ACCENT} !important; }
        .sludge-page .play-btn { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .sludge-page .play-btn:hover { background: ${ACCENT} !important; color: #0a0a0a !important; }
        .sludge-page .source-btn.active { background: ${ACCENT} !important; border-color: ${ACCENT} !important; }
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
        Striped Sludge Delay
      </h1>
      <p style={{ opacity: 0.7, marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        Like Candy Coil, but the delay curve is a centered hump — voices start
        below the original pitch, cross through it at their loudest, and fade
        out above. The Shepard illusion sweeps both directions through the
        original frequency. {dirUp ? "Rising" : "Falling"} with ±{semitones} st range.
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
              title={`${p.speed} Hz / ${p.range}s / ${p.numVoices}v`}
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
          label="Speed"
          value={speed}
          min={0}
          max={SPEED_LIMIT}
          step={0.001}
          unit="Hz"
          curve={2}
          onChange={setSpeed}
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
            ±{semitones} st
          </span>
        </div>
        <Slider
          label="Range"
          value={range}
          min={RANGE_MIN}
          max={RANGE_MAX}
          step={0.001}
          unit="s"
          curve={3}
          onChange={setRange}
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
          min={0.001}
          max={5}
          step={0.001}
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
  IN["Input -- mic / file"] -->|"x gain"| PLUS["(+) buffer input"]
  FB_RD -->|"x feedback"| PLUS
  GFB_TAP -->|"x globalFeedback"| PLUS
  PLUS --> WRITE["Write to circular buffer"]
  WRITE --> FB_RD["fbHead: read at fbDelay -- SILENT"]
  FB_RD -->|"x 0 -- not heard"| SINK["fbSink"]
  WRITE --> V0["Voice 0: centered hump delay"]
  WRITE --> V1["Voice 1: centered hump delay"]
  WRITE --> VN["Voice N: centered hump delay"]
  V0 -->|"x Hann window"| SUM["Sum all voices"]
  V1 -->|"x Hann window"| SUM
  VN -->|"x Hann window"| SUM
  SUM --> GFB_TAP["Global FB tap -- mixed voices"]
  GFB_TAP -->|"x dryWet"| WET["Wet signal"]
  IN -->|"x 1 - dryWet"| DRY["Dry signal"]
  DRY --> OUT_MIX["(+) output"]
  WET --> OUT_MIX
  SINK --> OUT_MIX
  OUT_MIX --> OUT["Output"]
  OUT --> HUMP["Centered Hump Curve"]
  HUMP --> H1["p=0 delay=0 — pitch BELOW original"]
  HUMP --> H2["p=0.5 delay=range peak — ORIGINAL pitch loudest"]
  HUMP --> H3["p=1 delay=0 — pitch ABOVE original"]
`} />
    </div>
  );
}
