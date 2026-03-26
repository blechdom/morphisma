import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  rissetCoilDelayGraph,
  MAX_VOICES,
  type RissetCoilDelayParams,
} from "@/synth/risset-coil-delay";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";

type Source = "mic" | "file";

const SPEED_LIMIT = 1;
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
  inputGain: number;
}

const BUILT_IN_PRESETS: Preset[] = [
  { name: "Risset Up",      speed: 0.05, range: 2.0, directionUp: true,  numVoices: 8,  tilt: 0,    feedback: 0.0,  fbDelay: 0.25, dryWet: 0.8,  inputGain: 1.0 },
  { name: "Risset Down",    speed: 0.05, range: 2.0, directionUp: false, numVoices: 8,  tilt: 0,    feedback: 0.0,  fbDelay: 0.25, dryWet: 0.8,  inputGain: 1.0 },
  { name: "Deep Rise",      speed: 0.03, range: 3.0, directionUp: true,  numVoices: 12, tilt: 0,    feedback: 0.0,  fbDelay: 0.25, dryWet: 0.8,  inputGain: 1.0 },
  { name: "Echo Rise",      speed: 0.04, range: 2.0, directionUp: true,  numVoices: 8,  tilt: -0.3, feedback: 0.6,  fbDelay: 0.5,  dryWet: 0.7,  inputGain: 1.0 },
  { name: "Dub Fall",       speed: 0.05, range: 2.5, directionUp: false, numVoices: 8,  tilt: -0.5, feedback: 0.7,  fbDelay: 0.38, dryWet: 0.7,  inputGain: 1.0 },
  { name: "Frozen",         speed: 0.02, range: 3.0, directionUp: true,  numVoices: 12, tilt: 0,    feedback: 0.85, fbDelay: 2.0,  dryWet: 0.9,  inputGain: 0.8 },
  { name: "Glacial Fall",   speed: 0.01, range: 5.0, directionUp: false, numVoices: 12, tilt: 0.3,  feedback: 0.7,  fbDelay: 3.0,  dryWet: 0.85, inputGain: 1.0 },
  { name: "Faster Spiral",  speed: 0.15, range: 3.0, directionUp: true,  numVoices: 8,  tilt: 0,    feedback: 0.4,  fbDelay: 0.75, dryWet: 0.7,  inputGain: 1.0 },
];

function deriveParams(
  speed: number,
  range: number,
  directionUp: boolean,
  rest: Omit<RissetCoilDelayParams, "speed" | "range" | "directionUp">
): RissetCoilDelayParams {
  return { ...rest, speed, range, directionUp };
}

export function RissetCoilDelay() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");

  const [speed, setSpeed] = useState(0.05);
  const [range, setRange] = useState(2.0);
  const [dirUp, setDirUp] = useState(true);
  const [numVoices, setNumVoices] = useState(8);
  const [tilt, setTilt] = useState(0);
  const [feedback, setFeedback] = useState(0.0);
  const [fbDelay, setFbDelay] = useState(0.25);
  const [dryWet, setDryWet] = useState(0.8);
  const [inputGain, setInputGain] = useState(1.0);

  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);
  const tapTimesRef = useRef<number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(playing);
  const sourceConnectedRef = useRef(false);
  playingRef.current = playing;

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
    const graph = rissetCoilDelayGraph(params, sr);
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

  const handleRange = (newRange: number) => {
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
    setInputGain(p.inputGain);
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
      { name, speed, range, directionUp: dirUp, numVoices, tilt, feedback, fbDelay, dryWet, inputGain },
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
      <h1 className="site-title" style={{ color: "#50b8a0" }}>
        Risset Coil Delay
      </h1>
      <p style={{ opacity: 0.7, marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        Same engine as Candy Coil but tuned for the classic Shepard-Risset
        illusion — feed it a steady tone and the echoes sound like they
        endlessly {dirUp ? "rise" : "fall"}.
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
        <button className="play-btn" onClick={togglePlay}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <div className="scope-wrap">
          <Oscilloscope data={scopeData} color="#50b8a0" width={300} height={100} />
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
          min={0.005}
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
              style={{ accentColor: "#50b8a0" }}
            />
            {dirUp ? "Up" : "Down"}
          </label>
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
