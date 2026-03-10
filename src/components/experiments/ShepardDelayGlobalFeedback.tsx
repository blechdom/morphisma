import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  shepardDelayGlobalFeedbackGraph,
  type ShepardDelayGlobalFeedbackParams,
} from "@/synth/shepard-delay-global-feedback";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";

type Source = "mic" | "file";

type Preset = [number, number, number, boolean, number, number, number];

const PRESETS: Preset[] = [
  //  voices  speed  ratio  up     wet   fb    gain
  [6,       0.15,  2.0,   true,  0.8,  0.0,  1.0],
  [6,       0.15,  2.0,   false, 0.8,  0.0,  1.0],
  [6,       0.05,  2.0,   true,  0.8,  0.0,  1.0],
  [6,       0.5,   2.0,   true,  0.8,  0.0,  1.0],
  [6,       0.15,  2.0,   true,  0.7,  0.6,  1.0],
  [8,       0.15,  3.0,   true,  0.7,  0.5,  1.0],
  [8,       0.1,   2.0,   true,  0.6,  0.9,  1.0],
];

const PRESET_NAMES = [
  "Rise",
  "Fall",
  "Slow Rise",
  "Fast Rise",
  "Feedback",
  "Wide + FB",
  "Infinite",
];

function presetToParams(p: Preset): ShepardDelayGlobalFeedbackParams {
  return {
    numVoices: p[0],
    speed: p[1],
    intervalRatio: p[2],
    directionUp: p[3],
    dryWet: p[4],
    feedback: p[5],
    inputGain: p[6],
  };
}

export function ShepardDelayGlobalFeedback() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");
  const [params, setParams] = useState<ShepardDelayGlobalFeedbackParams>(
    presetToParams(PRESETS[0])
  );
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(playing);
  const sourceConnectedRef = useRef(false);
  playingRef.current = playing;

  const K = params.directionUp
    ? params.intervalRatio - 1
    : 1 - 1 / params.intervalRatio;
  const targetRange = (K * 44100) / (2 * params.speed);
  const clampedRange = Math.min(targetRange, 30 * 44100 - 1);
  const actualMaxPitch = params.directionUp
    ? 1 + (2 * clampedRange * params.speed) / 44100
    : 1 - (2 * clampedRange * params.speed) / 44100;

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
    const graph = shepardDelayGlobalFeedbackGraph(params, sr);
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

  const applyPreset = (index: number) => {
    setParams(presetToParams(PRESETS[index]));
  };

  const set = <K extends keyof ShepardDelayGlobalFeedbackParams>(
    key: K,
    value: ShepardDelayGlobalFeedbackParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      <h1 className="site-title" style={{ color: "#ff4444" }}>
        Shepard Delay — Global Feedback
      </h1>

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
          <Oscilloscope data={scopeData} width={300} height={100} />
        </div>
      </div>

      <div className="controls">
        <Slider
          label="Input Gain"
          value={params.inputGain}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) => set("inputGain", v)}
        />
        <Slider
          label="Output Vol"
          value={outputVol}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setOutputVol(v)}
        />
        <Slider
          label="Dry / Wet"
          value={params.dryWet}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set("dryWet", v)}
        />
        <Slider
          label="Speed"
          value={params.speed}
          min={0.02}
          max={2}
          step={0.01}
          onChange={(v) => set("speed", v)}
        />
        <Slider
          label="Interval"
          value={params.intervalRatio}
          min={1.1}
          max={4}
          step={0.1}
          onChange={(v) => set("intervalRatio", v)}
        />
        <Slider
          label="Voices"
          value={params.numVoices}
          min={3}
          max={12}
          step={1}
          onChange={(v) => set("numVoices", v)}
        />
        <Slider
          label="Global Feedback"
          value={params.feedback}
          min={0}
          max={0.99}
          step={0.01}
          onChange={(v) => set("feedback", v)}
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

        <div className="info-row">
          <span className="info-label">Pitch Range</span>
          <span className="info-value">
            1.00x → {actualMaxPitch.toFixed(2)}x
            ({actualMaxPitch > 0 ? Math.round(12 * Math.log2(actualMaxPitch)) : "—"} st)
          </span>
        </div>
      </div>

      <div className="presets">
        <span className="presets-label">Presets</span>
        {PRESETS.map((_, i) => (
          <button
            key={i}
            className="preset-btn"
            onClick={() => applyPreset(i)}
            title={PRESET_NAMES[i]}
          >
            {PRESET_NAMES[i]}
          </button>
        ))}
      </div>
    </div>
  );
}
