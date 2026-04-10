import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  bipolarBreakdownDelayGraph,
  type BipolarBreakdownDelayParams,
  type Direction,
  type AnchorMode,
} from "@/synth/bipolar-breakdown-delay";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";
import { Mermaid } from "@/components/Mermaid";

type Source = "mic" | "file";

const STRIPES = [
  { color: "rgba(80,20,140,0.4)",   width: 44 },
  { color: "rgba(15,10,25,0.35)",   width: 44 },
  { color: "rgba(255,50,200,0.5)",  width: 12 },
  { color: "rgba(60,20,100,0.35)",  width: 44 },
  { color: "rgba(120,40,180,0.4)",  width: 44 },
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

const ACCENT = "#cc88dd";

interface Preset {
  name: string;
  direction: Direction;
  anchorMode: AnchorMode;
  numVoices: number;
  fullSweep: boolean;
  speed: number;
  startDelay: number;
  minDelay: number;
  initRate: number;
  accel: number;
  maxPasses: number;
  feedback: number;
  fbDelay: number;
  globalFeedback: number;
  dryWet: number;
}

const BUILT_IN_PRESETS: Preset[] = [
  { name: "Paddle Ball",       direction: "boomerang", anchorMode: "fixed",    numVoices: 1,  fullSweep: true,  speed: 0.5,  startDelay: 1.5,  minDelay: 0.05, initRate: 2.0, accel: 0,     maxPasses: 8,  feedback: 0,   fbDelay: 1.0,  globalFeedback: 0,   dryWet: 0.9  },
  { name: "Concat Loop",       direction: "forward",   anchorMode: "fixed",    numVoices: 1,  fullSweep: true,  speed: 0.2,  startDelay: 3.0,  minDelay: 1.0,  initRate: 2.0, accel: 0,     maxPasses: 10, feedback: 0,   fbDelay: 1.0,  globalFeedback: 0,   dryWet: 0.85 },
  { name: "Elastic Bounce",    direction: "boomerang", anchorMode: "tracking", numVoices: 1,  fullSweep: true,  speed: 1.0,  startDelay: 0.8,  minDelay: 0.02, initRate: 2.0, accel: 0,     maxPasses: 10, feedback: 0.3, fbDelay: 1.0,  globalFeedback: 0,   dryWet: 0.9  },
  { name: "Spawning Choir",    direction: "forward",   anchorMode: "fixed",    numVoices: 6,  fullSweep: true,  speed: 0.25, startDelay: 3.0,  minDelay: 1.0,  initRate: 2.0, accel: 0,     maxPasses: 12, feedback: 0,   fbDelay: 1.0,  globalFeedback: 0,   dryWet: 0.9  },
  { name: "Boomerang Layers",  direction: "boomerang", anchorMode: "fixed",    numVoices: 4,  fullSweep: true,  speed: 0.3,  startDelay: 2.5,  minDelay: 0.5,  initRate: 2.0, accel: 0,     maxPasses: 8,  feedback: 0,   fbDelay: 1.0,  globalFeedback: 0,   dryWet: 0.9  },
  { name: "Tight Paddle",      direction: "boomerang", anchorMode: "tracking", numVoices: 1,  fullSweep: true,  speed: 3.0,  startDelay: 0.15, minDelay: 0.005,initRate: 2.0, accel: 0,     maxPasses: 10, feedback: 0.5, fbDelay: 0.5,  globalFeedback: 0,   dryWet: 0.85 },
  { name: "Decel Drift",       direction: "forward",   anchorMode: "fixed",    numVoices: 3,  fullSweep: false, speed: 0.4,  startDelay: 3.0,  minDelay: 1.0,  initRate: 2.0, accel: -0.12, maxPasses: 12, feedback: 0,   fbDelay: 1.0,  globalFeedback: 0,   dryWet: 0.85 },
  { name: "Fixed Accel",       direction: "forward",   anchorMode: "fixed",    numVoices: 1,  fullSweep: false, speed: 0.5,  startDelay: 2.0,  minDelay: 1.0,  initRate: 0.5, accel: 0.15,  maxPasses: 12, feedback: 0,   fbDelay: 1.0,  globalFeedback: 0,   dryWet: 0.85 },
  { name: "Reverse Cascade",   direction: "backward",  anchorMode: "fixed",    numVoices: 5,  fullSweep: true,  speed: 0.3,  startDelay: 3.0,  minDelay: 0.5,  initRate: 2.0, accel: 0,     maxPasses: 10, feedback: 0.3, fbDelay: 2.0,  globalFeedback: 0,   dryWet: 1.0  },
  { name: "Ping Pong Blur",    direction: "boomerang", anchorMode: "tracking", numVoices: 4,  fullSweep: true,  speed: 0.6,  startDelay: 1.5,  minDelay: 0.5,  initRate: 2.0, accel: 0,     maxPasses: 10, feedback: 0.4, fbDelay: 1.0,  globalFeedback: 0,   dryWet: 0.9  },
  { name: "Deep Freeze",       direction: "forward",   anchorMode: "fixed",    numVoices: 1,  fullSweep: false, speed: 0.15, startDelay: 5.0,  minDelay: 1.0,  initRate: 0.1, accel: 0.05,  maxPasses: 20, feedback: 0.5, fbDelay: 3.0,  globalFeedback: 0,   dryWet: 1.0  },
  { name: "Self-Feed Rise",    direction: "forward",   anchorMode: "fixed",    numVoices: 3,  fullSweep: false, speed: 0.4,  startDelay: 2.0,  minDelay: 1.0,  initRate: 0.4, accel: 0.15,  maxPasses: 12, feedback: 0.3, fbDelay: 1.5,  globalFeedback: 0.5, dryWet: 1.0  },
];

export function BipolarBreakdownDelay() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");

  const [direction, setDirection] = useState<Direction>("forward");
  const [anchorMode, setAnchorMode] = useState<AnchorMode>("fixed");
  const [numVoices, setNumVoices] = useState(1);
  const [fullSweep, setFullSweep] = useState(true);
  const [speed, setSpeed] = useState(0.2);
  const [startDelay, setStartDelay] = useState(3.0);
  const [minDelay, setMinDelay] = useState(1.0);
  const [initRate, setInitRate] = useState(2.0);
  const [accel, setAccel] = useState(0.0);
  const [maxPasses, setMaxPasses] = useState(10);
  const [feedback, setFeedback] = useState(0.0);
  const [fbDelay, setFbDelay] = useState(1.0);
  const [globalFeedback, setGlobalFeedback] = useState(0.0);
  const [dryWet, setDryWet] = useState(0.85);
  const [inputGain, setInputGain] = useState(1.0);
  const [resetCount, setResetCount] = useState(0);

  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [customPresets, setCustomPresets] = useState<Preset[]>(() => {
    try {
      const stored = localStorage.getItem("bipolar-breakdown-presets");
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

  const params: BipolarBreakdownDelayParams = {
    direction, anchorMode, numVoices, fullSweep,
    speed, startDelay, minDelay, initRate, accel, maxPasses,
    feedback, fbDelay, globalFeedback, dryWet, inputGain, resetCount,
  };

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
    const graph = bipolarBreakdownDelayGraph(params, sr);
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
    setDirection(p.direction);
    setAnchorMode(p.anchorMode);
    setNumVoices(p.numVoices);
    setFullSweep(p.fullSweep);
    setSpeed(p.speed);
    setStartDelay(p.startDelay);
    setMinDelay(p.minDelay);
    setInitRate(p.initRate);
    setAccel(p.accel);
    setMaxPasses(p.maxPasses);
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
    try { localStorage.setItem("bipolar-breakdown-presets", JSON.stringify(customPresets)); }
    catch {}
  }, [customPresets]);

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setCustomPresets((prev) => [
      ...prev,
      {
        name, direction, anchorMode, numVoices, fullSweep,
        speed, startDelay, minDelay, initRate, accel, maxPasses,
        feedback, fbDelay, globalFeedback, dryWet,
      },
    ]);
    setSavingPreset(false);
    setPresetName("");
  };

  const deleteCustomPreset = (index: number) => {
    setCustomPresets((prev) => prev.filter((_, i) => i !== index));
  };

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  const modeBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      className={`source-btn ${active ? "active" : ""}`}
      onClick={onClick}
      style={{ fontSize: "0.7rem", padding: "0.25rem 0.6rem" }}
    >
      {label}
    </button>
  );

  return (
    <div className="bipolar-page">
      <style>{`
        .bipolar-page input[type="range"]::-webkit-slider-thumb { background: ${ACCENT} !important; }
        .bipolar-page input[type="range"]::-moz-range-thumb { background: ${ACCENT} !important; }
        .bipolar-page .play-btn { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .bipolar-page .play-btn:hover { background: ${ACCENT} !important; color: #0a0a0a !important; }
        .bipolar-page .source-btn.active { background: ${ACCENT} !important; border-color: ${ACCENT} !important; }
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
          transform: "rotate(-45deg) scale(1.6)",
          transformOrigin: "center center",
        }}
      >
        {STRIPE_PATHS.map((s, i) => (
          <path key={i} d={s.d} fill={s.fill} />
        ))}
      </svg>
      <h1 className="site-title" style={{ color: ACCENT }}>
        Bipolar Breakdown Delay
      </h1>
      <p style={{ color: "#ff6666", fontWeight: "bold", marginTop: "-0.5rem", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
        WORK-IN-PROGRESS
      </p>
      <p style={{ opacity: 0.7, marginTop: "0", marginBottom: "1.5rem" }}>
        Record head writes continuously. Position (x) marks an anchor in the
        buffer. Each voice spawns at an equal interval through the cycle, setting
        its own anchor at startDelay behind the record head at that moment.
        Voices sweep between their anchor and the record head — forward,
        backward, or boomerang — at constant, accelerating, or decelerating
        rates. Fixed anchor lets each voice&apos;s extent grow as the record head
        moves on; tracking keeps extent at a set delay.
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
        <button
          className="play-btn"
          style={{ opacity: 1, background: "transparent", marginLeft: "0.5rem", fontSize: "0.75rem" }}
          onClick={() => setResetCount((c) => c + 1)}
          title="Reset position (x) — re-anchor to startDelay behind the current record head"
        >
          ↺ Reset X
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
              title={`${p.direction} / ${p.anchorMode} / ${p.numVoices}v / ${p.fullSweep ? "sweep" : "rate"}`}
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

      {/* Mode toggles */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", margin: "1rem 0" }}>
        <div>
          <span className="slider-label" style={{ marginBottom: "0.25rem", display: "block" }}>DIRECTION</span>
          <div className="source-buttons">
            {modeBtn("Forward", direction === "forward", () => setDirection("forward"))}
            {modeBtn("Backward", direction === "backward", () => setDirection("backward"))}
            {modeBtn("Boomerang", direction === "boomerang", () => setDirection("boomerang"))}
          </div>
        </div>
        <div>
          <span className="slider-label" style={{ marginBottom: "0.25rem", display: "block" }}>ANCHOR</span>
          <div className="source-buttons">
            {modeBtn("Fixed", anchorMode === "fixed", () => setAnchorMode("fixed"))}
            {modeBtn("Tracking", anchorMode === "tracking", () => setAnchorMode("tracking"))}
          </div>
        </div>
        <div>
          <span className="slider-label" style={{ marginBottom: "0.25rem", display: "block" }}>SWEEP</span>
          <div className="source-buttons">
            {modeBtn("Full Range", fullSweep, () => setFullSweep(true))}
            {modeBtn("Rate Ctrl", !fullSweep, () => setFullSweep(false))}
          </div>
        </div>
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
          label="Speed"
          value={speed}
          min={0.01}
          max={20}
          step={0.01}
          unit="Hz"
          curve={2}
          onChange={setSpeed}
        />
        <Slider
          label="Start Delay"
          value={startDelay}
          min={0.002}
          max={10}
          step={0.001}
          unit="s"
          curve={3}
          onChange={setStartDelay}
        />
        <Slider
          label="Min Delay"
          value={minDelay}
          min={0.001}
          max={5}
          step={0.001}
          unit="s"
          curve={3}
          onChange={setMinDelay}
        />
        <Slider
          label="Voices"
          value={numVoices}
          min={1}
          max={12}
          step={1}
          onChange={setNumVoices}
        />
        {!fullSweep && (
          <>
            <Slider
              label="Init Rate"
              value={initRate}
              min={0.05}
              max={4}
              step={0.01}
              unit="×"
              curve={2}
              onChange={setInitRate}
            />
            <Slider
              label="Accel"
              value={accel}
              min={-2}
              max={2}
              step={0.01}
              unit="×/pass"
              onChange={setAccel}
            />
          </>
        )}
        {anchorMode === "fixed" && (
          <Slider
            label="Max Passes"
            value={maxPasses}
            min={2}
            max={50}
            step={1}
            onChange={setMaxPasses}
          />
        )}
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
  WRITE --> V["Voices 1..N -- each spawns with own anchor"]
  V --> BIRTH["Voice i born at i/N through cycle"]
  BIRTH --> ANCHOR["Anchor = startDelay behind record head at birth"]
  ANCHOR --> EXT["Extent grows as record head moves on"]
  EXT --> DIR["Direction: fwd / bwd / boomerang"]
  DIR -->|"delay = voiceExtent - sweepRange x sweepPhase"| READ["Read from buffer"]
  READ -->|"x alive gate -- fade in at birth"| SUM["Sum all voices"]
  SUM -->|"x cycleEnv -- fade out if fixed"| GFB_TAP["Global FB tap"]
  GFB_TAP -->|"x dryWet"| WET["Wet signal"]
  IN -->|"x 1 - dryWet"| DRY["Dry signal"]
  DRY --> OUT_MIX["(+) output"]
  WET --> OUT_MIX
  SINK --> OUT_MIX
  OUT_MIX --> OUT["Output"]
`} />
      <div style={{ opacity: 0.5, fontSize: "0.7rem", marginTop: "0.5rem" }}>
        <p><strong>Voices</strong>: each voice spawns at an equal interval through the cycle, setting its own anchor at startDelay behind the record head at the moment of birth. Earlier voices accumulate more extent as the record head advances.</p>
        <p><strong>Fixed anchor</strong>: each voice&apos;s anchor stays put — extent grows. Fade-out envelope ends each cycle, then all voices reset.</p>
        <p><strong>Tracking anchor</strong>: anchors follow the record head at a set delay — extent stays constant, perpetual playback.</p>
        <p><strong>Full Range</strong>: sweep covers the full extent each pass. <strong>Rate Ctrl</strong>: sweep range = (initRate + N×accel − 1) × passDuration. Accel can be negative for deceleration.</p>
      </div>
    </div>
  );
}
