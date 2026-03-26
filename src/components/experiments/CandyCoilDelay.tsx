import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  candyCoilDelayGraph,
  MAX_VOICES,
  type CandyCoilDelayParams,
} from "@/synth/candy-coil-delay";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";

type Source = "mic" | "file";

const STRIPE_COLORS = [
  "rgba(220,60,80,0.4)",
  "rgba(255,255,255,0.25)",
  "rgba(230,80,160,0.4)",
  "rgba(140,50,160,0.4)",
];
const STRIPE_W = 44;
const SINE_AMP = 14;
const SINE_PERIOD = 260;
const CANVAS = 3000;
const NUM_STRIPES = Math.ceil(CANVAS / STRIPE_W) + 1;
const PATH_STEPS = 80;

function sineStripePath(i: number): string {
  const topY = i * STRIPE_W;
  const botY = topY + STRIPE_W;
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

const STRIPE_PATHS = Array.from({ length: NUM_STRIPES }, (_, i) => ({
  d: sineStripePath(i),
  fill: STRIPE_COLORS[i % STRIPE_COLORS.length],
}));

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
  dryWet: number;
}

const BUILT_IN_PRESETS: Preset[] = [
  { name: "Dry Coil",        speed: 1.0,   range: 1.0,   directionUp: true,  numVoices: 8,  tilt: 0,     feedback: 0.0,  fbDelay: 0.25,  dryWet: 0.5 },
  { name: "Short Echo",      speed: 0.3,   range: 0.4,   directionUp: true,  numVoices: 6,  tilt: -0.6,  feedback: 0.4,  fbDelay: 0.1,   dryWet: 0.65 },
  { name: "Dual Grind",      speed: 1.309, range: 0.104, directionUp: false, numVoices: 2,  tilt: -0.5,  feedback: 0.95, fbDelay: 0.006, dryWet: 1.0 },
  { name: "Tape Sustain",    speed: 2.5,   range: 0.3,   directionUp: false, numVoices: 3,  tilt: 0.7,   feedback: 0.85, fbDelay: 0.35,  dryWet: 0.45 },
  { name: "Dense Spiral",    speed: 0.77,  range: 2.032, directionUp: true,  numVoices: 12, tilt: 0.28,  feedback: 0.95, fbDelay: 4.487, dryWet: 1.0 },
  { name: "Tight Comb",      speed: 4.0,   range: 0.2,   directionUp: true,  numVoices: 4,  tilt: 0,     feedback: 0.65, fbDelay: 0.015, dryWet: 0.55 },
  { name: "Slow Wash",       speed: 0.08,  range: 5.0,   directionUp: true,  numVoices: 12, tilt: -0.5,  feedback: 0.85, fbDelay: 3.5,   dryWet: 0.9 },
  { name: "Falling Deep",    speed: 0.6,   range: 2.5,   directionUp: false, numVoices: 10, tilt: 0.4,   feedback: 0.7,  fbDelay: 1.5,   dryWet: 0.8 },
  { name: "Fast & Dirty",    speed: 4.5,   range: 0.6,   directionUp: true,  numVoices: 2,  tilt: 0.8,   feedback: 0.5,  fbDelay: 0.04,  dryWet: 0.75 },
  { name: "Frozen Lake",     speed: 0.03,  range: 7.0,   directionUp: true,  numVoices: 12, tilt: 0,     feedback: 0.92, fbDelay: 4.0,   dryWet: 1.0 },
  { name: "Still Resonance", speed: 0.0,   range: 0.101, directionUp: true,  numVoices: 6,  tilt: -0.67, feedback: 0.0,  fbDelay: 0.001, dryWet: 1.0 },
  { name: "Long Repeat",     speed: 1.2,   range: 3.5,   directionUp: false, numVoices: 8,  tilt: 0.15,  feedback: 0.75, fbDelay: 2.0,   dryWet: 0.7 },
];

function deriveParams(
  speed: number,
  range: number,
  directionUp: boolean,
  rest: Omit<CandyCoilDelayParams, "speed" | "range" | "directionUp">
): CandyCoilDelayParams {
  return { ...rest, speed, range, directionUp };
}

export function CandyCoilDelay() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");

  const [speed, setSpeed] = useState(1.0);
  const [range, setRange] = useState(1.0);
  const [dirUp, setDirUp] = useState(true);
  const [numVoices, setNumVoices] = useState(8);
  const [tilt, setTilt] = useState(0);
  const [feedback, setFeedback] = useState(0.0);
  const [fbDelay, setFbDelay] = useState(0.25);
  const [dryWet, setDryWet] = useState(0.7);
  const [inputGain, setInputGain] = useState(1.0);

  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [lockRatio, setLockRatio] = useState(false);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);
  const tapTimesRef = useRef<number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(playing);
  const sourceConnectedRef = useRef(false);
  playingRef.current = playing;

  const pitchProduct = speed * range;
  const pitchRatio = dirUp ? 1 + pitchProduct : Math.max(1 - pitchProduct, 0.01);
  const semitones = Math.round(12 * Math.log2(Math.max(pitchRatio, 0.01)));

  const params = deriveParams(speed, range, dirUp, {
    numVoices,
    tilt,
    feedback,
    fbDelay,
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
    const graph = candyCoilDelayGraph(params, sr);
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

  const handleSpeed = (newSpeed: number) => {
    if (lockRatio && newSpeed > 0) {
      const r = Math.min(RANGE_MAX, Math.max(RANGE_MIN, 1 / newSpeed));
      setRange(Math.round(r * 1000) / 1000);
    }
    setSpeed(newSpeed);
  };

  const handleRange = (newRange: number) => {
    if (lockRatio && newRange > 0) {
      const s = Math.min(SPEED_LIMIT, 1 / newRange);
      setSpeed(Math.round(s * 1000) / 1000);
    }
    setRange(newRange);
  };

  const TAP_TIMEOUT = 3000;
  const handleTap = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    if (taps.length > 0 && now - taps[taps.length - 1] > TAP_TIMEOUT) {
      taps.length = 0;
    }
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length < 2) return;
    const intervals: number[] = [];
    for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const sec = Math.min(RANGE_MAX, Math.max(RANGE_MIN, avgMs / 1000));
    handleRange(Math.round(sec * 1000) / 1000);
  };

  const applyPreset = (p: Preset) => {
    setSpeed(p.speed);
    setRange(p.range);
    setDirUp(p.directionUp);
    setNumVoices(p.numVoices);
    setTilt(p.tilt);
    setFeedback(p.feedback);
    setFbDelay(p.fbDelay);
    setDryWet(p.dryWet);
  };

  const startSaving = () => {
    setSavingPreset(true);
    setPresetName("");
    setTimeout(() => saveInputRef.current?.focus(), 0);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setCustomPresets((prev) => [
      ...prev,
      { name, speed, range, directionUp: dirUp, numVoices, tilt, feedback, fbDelay, dryWet },
    ]);
    setSavingPreset(false);
    setPresetName("");
  };

  const deleteCustomPreset = (index: number) => {
    setCustomPresets((prev) => prev.filter((_, i) => i !== index));
  };

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

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
          transform: `rotate(${dirUp ? 45 : -45}deg) scale(1.6)`,
          transformOrigin: "center center",
        }}
      >
        {STRIPE_PATHS.map((s, i) => (
          <path key={i} d={s.d} fill={s.fill} />
        ))}
      </svg>
      <h1 className="site-title" style={{ color: "#e05090" }}>
        Candy Coil Delay
      </h1>
      <p style={{ opacity: 0.7, marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        {numVoices} sticky-sweet serpent heads spiral through infinite
        candy-striped elastic tape — each voice Hann-windowed and
        phase-staggered,         curling into an endless Shepard staircase of
        pitch-shifting echoes. Deep in the snail shell, feedback
        swirls between robotic terror and purring syrup.
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
          <Oscilloscope data={scopeData} color="#e05090" width={300} height={100} />
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
          onChange={handleSpeed}
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
              style={{ accentColor: "#e05090" }}
            />
            {dirUp ? "Up" : "Down"}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={lockRatio}
              onChange={(e) => setLockRatio(e.target.checked)}
              style={{ accentColor: "#e05090" }}
            />
            Lock range = 1/speed
          </label>
          <span style={{ marginLeft: "auto", color: "#999", fontVariantNumeric: "tabular-nums" }}>
            {pitchRatio.toFixed(2)}x / {semitones > 0 ? "+" : ""}{semitones} st
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ flex: 1 }}>
            <Slider
              label="Range"
              value={range}
              min={RANGE_MIN}
              max={RANGE_MAX}
              step={0.001}
              unit="s"
              curve={3}
              onChange={handleRange}
            />
          </div>
          <button
            onClick={handleTap}
            style={{
              padding: "0.35rem 0.6rem",
              fontSize: "0.7rem",
              fontWeight: 600,
              border: "1px solid #555",
              borderRadius: "4px",
              background: "#1e1e2e",
              color: "#bbb",
              cursor: "pointer",
              whiteSpace: "nowrap",
              lineHeight: 1,
              flexShrink: 0,
            }}
            title="Tap repeatedly to set range from tempo"
          >
            Tap
          </button>
        </div>

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
          label="Dry / Wet"
          value={dryWet}
          min={0}
          max={1}
          step={0.01}
          onChange={setDryWet}
        />
      </div>

      <pre style={{
        fontSize: "0.6rem",
        lineHeight: 1.4,
        color: "#888",
        background: "#111",
        padding: "0.75rem",
        borderRadius: "6px",
        overflow: "auto",
        marginTop: "1.5rem",
      }}>{`
  input (mic / file)
    │
    ▼
   (+)◄──────────── fb read output × feedback
    │                        ▲
    ▼                        │
  [write to buffer] ··· [fb read at fbDelay behind write]
    │                   (not sent to output)
    │
    ├─── [shepard read 0, sweeping position, Hann window] ──┐
    ├─── [shepard read 1, sweeping position, Hann window] ──┤
    ├─── ...                                                ├──► wet signal
    └─── [shepard read N, sweeping position, Hann window] ──┘
                                                    │
                                                    ▼
                                          wet × dryWet
                                                    │
    input × (1 - dryWet)                            │
         │                                          │
         └──────────────►(+)◄───────────────────────┘
                          │
                          ▼
                       output
`}</pre>
    </div>
  );
}
