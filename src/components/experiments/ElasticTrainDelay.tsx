import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  elasticTrainDelayGraph,
  MAX_VOICES,
  type ElasticTrainDelayParams,
} from "@/synth/elastic-train-delay";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";

type Source = "mic" | "file";

const STRIPES = [
  { color: "rgba(80,170,220,0.4)",   width: 44 },
  { color: "rgba(0,0,0,0.35)",       width: 44 },
  { color: "rgba(255,50,120,0.4)",   width: 12 },
  { color: "rgba(50,180,120,0.4)",   width: 44 },
  { color: "rgba(60,40,140,0.4)",    width: 44 },
];
const CANVAS = 3000;
const TAPER = 0.85;

const STRIPE_PATHS: { d: string; fill: string }[] = [];
{
  let yL = 0;
  let yR = 0;
  let idx = 0;
  while (yL < CANVAS || yR < CANVAS) {
    const s = STRIPES[idx % STRIPES.length];
    const wider = s.width * (1 + TAPER);
    const narrower = s.width * (1 - TAPER);
    const hL = idx % 2 === 0 ? wider : narrower;
    const hR = idx % 2 === 0 ? narrower : wider;
    const topL = yL, botL = yL + hL;
    const topR = yR, botR = yR + hR;
    STRIPE_PATHS.push({
      d: `M0,${topL} L${CANVAS},${topR} L${CANVAS},${botR} L0,${botL} Z`,
      fill: s.color,
    });
    yL = botL;
    yR = botR;
    idx++;
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
  dryWet: number;
  grainSize: number;
}

const BUILT_IN_PRESETS: Preset[] = [
  // Classic Shepard illusion — steady tone in, endless rise out
  { name: "Classic Rise",      speed: 0.08,  range: 4.0,  directionUp: true,  numVoices: 8,  tilt: 0,     feedback: 0.0,  fbDelay: 4.0,   dryWet: 0.85, grainSize: 0.05 },
  // Mirror image — same shape, falling
  { name: "Classic Fall",      speed: 0.08,  range: 4.0,  directionUp: false, numVoices: 8,  tilt: 0,     feedback: 0.0,  fbDelay: 4.0,   dryWet: 0.85, grainSize: 0.05 },
  // Very slow, very deep buffer — glacial pitch drift
  { name: "Glacial Drift",     speed: 0.015, range: 8.0,  directionUp: true,  numVoices: 12, tilt: 0,     feedback: 0.75, fbDelay: 12.0,  dryWet: 1.0,  grainSize: 0.04 },
  // Tight interval, fast cycle — metallic shimmer
  { name: "Metal Shimmer",     speed: 0.6,   range: 1.0,  directionUp: true,  numVoices: 6,  tilt: 0.7,   feedback: 0.5,  fbDelay: 1.5,   dryWet: 0.7,  grainSize: 0.01 },
  // 2 voices, heavy feedback, harsh robotic texture
  { name: "Robot Grind",       speed: 1.2,   range: 1.0,  directionUp: false, numVoices: 2,  tilt: -0.6,  feedback: 0.93, fbDelay: 2.0,   dryWet: 1.0,  grainSize: 0.015 },
  // Big grain size — chunky, granular texture
  { name: "Grain Cloud",       speed: 0.1,   range: 3.0,  directionUp: true,  numVoices: 10, tilt: -0.3,  feedback: 0.3,  fbDelay: 5.0,   dryWet: 0.9,  grainSize: 0.3  },
  // Tiny grain size — smooth, nearly continuous pitch shift
  { name: "Silk Glide",        speed: 0.05,  range: 6.0,  directionUp: false, numVoices: 12, tilt: 0,     feedback: 0.0,  fbDelay: 6.0,   dryWet: 0.8,  grainSize: 0.008 },
  // Asymmetric tilt — voices pile up at the beginning of the sweep
  { name: "Slow Start",        speed: 0.06,  range: 5.0,  directionUp: true,  numVoices: 8,  tilt: -0.8,  feedback: 0.4,  fbDelay: 6.0,   dryWet: 0.9,  grainSize: 0.04 },
  // Opposite tilt — voices cluster at the end, near the write head
  { name: "Fast Finish",       speed: 0.06,  range: 5.0,  directionUp: true,  numVoices: 8,  tilt: 0.8,   feedback: 0.4,  fbDelay: 6.0,   dryWet: 0.9,  grainSize: 0.04 },
  // High feedback, long buffer — self-reinforcing drone
  { name: "Feedback Drone",    speed: 0.03,  range: 2.0,  directionUp: true,  numVoices: 12, tilt: 0,     feedback: 0.92, fbDelay: 8.0,   dryWet: 1.0,  grainSize: 0.06 },
  // Full octave range, all voices, pure wet — maximum illusion
  { name: "Full Spectrum",     speed: 0.04,  range: 10.0, directionUp: true,  numVoices: 12, tilt: 0,     feedback: 0.0,  fbDelay: 10.0,  dryWet: 1.0,  grainSize: 0.03 },
  // Mixed dry/wet with moderate settings — subtle effect
  { name: "Gentle Blend",      speed: 0.12,  range: 2.0,  directionUp: false, numVoices: 6,  tilt: 0.2,   feedback: 0.2,  fbDelay: 3.0,   dryWet: 0.4,  grainSize: 0.06 },
];

const ACCENT = "#50b8a0";

function deriveParams(
  speed: number,
  range: number,
  directionUp: boolean,
  rest: Omit<ElasticTrainDelayParams, "speed" | "range" | "directionUp">
): ElasticTrainDelayParams {
  return { ...rest, speed, range, directionUp };
}

export function ElasticTrainDelay() {
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
  const [dryWet, setDryWet] = useState(0.8);
  const [inputGain, setInputGain] = useState(1.0);
  const [grainSize, setGrainSize] = useState(0.05);

  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [customPresets, setCustomPresets] = useState<Preset[]>(() => {
    try {
      const stored = localStorage.getItem("elastic-train-presets");
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
    dryWet,
    inputGain,
    grainSize,
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
    const graph = elasticTrainDelayGraph(params, sr);
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
    setSpeed(newSpeed);
  };

  const handleRange = (newRange: number) => {
    setRange(newRange);
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
    setGrainSize(p.grainSize);
  };

  const startSaving = () => {
    setSavingPreset(true);
    setPresetName("");
    setTimeout(() => saveInputRef.current?.focus(), 0);
  };

  useEffect(() => {
    try { localStorage.setItem("elastic-train-presets", JSON.stringify(customPresets)); }
    catch { /* storage full or unavailable */ }
  }, [customPresets]);

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setCustomPresets((prev) => [
      ...prev,
      { name, speed, range, directionUp: dirUp, numVoices, tilt, feedback, fbDelay, dryWet, grainSize },
    ]);
    setSavingPreset(false);
    setPresetName("");
  };

  const deleteCustomPreset = (index: number) => {
    setCustomPresets((prev) => prev.filter((_, i) => i !== index));
  };

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  return (
    <div className="risset-coil-page">
      <style>{`
        .risset-coil-page input[type="range"]::-webkit-slider-thumb { background: ${ACCENT} !important; }
        .risset-coil-page input[type="range"]::-moz-range-thumb { background: ${ACCENT} !important; }
        .risset-coil-page .play-btn { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .risset-coil-page .play-btn:hover { background: ${ACCENT} !important; color: #0a0a0a !important; }
        .risset-coil-page .source-btn.active { background: ${ACCENT} !important; border-color: ${ACCENT} !important; }
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
        Elastic Train Delay
      </h1>
      <p style={{ opacity: 0.7, marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        {numVoices} voices sweep an exponential arc through a deep circular
        buffer — starting at the silent feedback head ({fbDelay.toFixed(1)}s
        behind the record head) and accelerating toward the present. Two-level
        Hann windowing keeps each grain smooth while the sweep fades in and out
        across the full journey. The result: an endlessly {dirUp ? "rising" : "falling"} pitch
        illusion stretched across seconds of buffered audio.
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
              title={`${p.speed} Hz / ${p.range} oct / ${p.numVoices}v / ${p.grainSize}s grain`}
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
          onChange={handleRange}
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
    │   ┌──────── buffer (fbDelay → write head) ────────┐
    │   │                                               │
    │   │  fb head                          write head  │
    │   │  (start)                             (end)    │
    │   │    │                                  │       │
    │   │    ├─[grain]─[grain]─[grain]─ ··· ─[grain]    │
    │   │    │  slow      ──────────►      fast  │      │
    │   │    │  (continuous sweep, grain-windowed)│      │
    │   │    │                                   │      │
    │   │    │◄──── sweep Hann (fade in/out) ───►│      │
    │   │    │  × grain Hann (per-chunk window)  │      │
    │   └────┴───────────────────────────────────┘      │
    │                                                   │
    ├─── [voice 0: grains fb→write, 2-level Hann] ──┐  │
    ├─── [voice 1: grains fb→write, 2-level Hann] ──┤  │
    ├─── ...                                         ├──► wet
    └─── [voice N: grains fb→write, 2-level Hann] ──┘
                                                    │
                                          wet × dryWet
                                                    │
    input × (1 - dryWet) ──────────────►(+)◄────────┘
                                         │
                                         ▼
                                       output

  Two-level windowing (continuous sweep):
  • Grain Hann — small repeating window (grainSize), smooths the sweep
  • Sweep Hann — large fade-in at fb head, fade-out at write head
  Pitch illusion from voices continuously accelerating toward the write head.
  Exponential curve: each equal step in phasor-space = equal octave step in pitch.
`}</pre>
    </div>
  );
}
