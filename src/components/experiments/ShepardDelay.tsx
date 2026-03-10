import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  shepardDelayGraph,
  type ShepardDelayParams,
} from "@/synth/shepard-delay";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";

type Source = "mic" | "file";

type Preset = [number, number, number, number, boolean, number, number, number];

const PRESETS: Preset[] = [
  [4, 0.03, 2000, 2.0, true, 0.7, 0.5, 1.0],
  [4, 0.03, 2000, 2.0, false, 0.7, 0.5, 1.0],
  [6, 0.15, 1000, 1.5, true, 0.8, 0.3, 1.0],
  [4, 0.02, 3000, 2.0, true, 0.6, 0.9, 1.0],
  [8, 0.01, 2000, 2.0, true, 0.6, 0.98, 1.0],
];

const PRESET_NAMES = [
  "Classic",
  "Reverse",
  "Cascade",
  "Long Tail",
  "Infinite",
];

function presetToParams(p: Preset): ShepardDelayParams {
  return {
    numVoices: p[0],
    speed: p[1],
    maxDelayMs: p[2],
    intervalRatio: p[3],
    directionUp: p[4],
    dryWet: p[5],
    feedback: p[6],
    inputGain: p[7],
  };
}

export function ShepardDelay() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");
  const [params, setParams] = useState<ShepardDelayParams>(
    presetToParams(PRESETS[0])
  );
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(playing);
  const sourceConnectedRef = useRef(false);
  playingRef.current = playing;

  const computedMinDelay = Math.max(
    params.maxDelayMs / (params.intervalRatio * params.numVoices),
    5
  );

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
    const delayGraph = shepardDelayGraph(params, sr);
    const gained = el.mul(
      delayGraph,
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

  const set = <K extends keyof ShepardDelayParams>(
    key: K,
    value: ShepardDelayParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      <h1 className="site-title" style={{ color: "#ff4444" }}>Shepard Delay</h1>

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
          label="Feedback"
          value={params.feedback}
          min={0}
          max={0.99}
          step={0.01}
          onChange={(v) => set("feedback", v)}
        />
        <Slider
          label="Voices"
          value={params.numVoices}
          min={2}
          max={16}
          step={1}
          onChange={(v) => set("numVoices", v)}
        />
        <Slider
          label="Speed"
          value={params.speed}
          min={0.005}
          max={2}
          step={0.005}
          onChange={(v) => set("speed", v)}
        />
        <Slider
          label="Max Delay"
          value={params.maxDelayMs}
          min={100}
          max={4000}
          step={10}
          unit="ms"
          onChange={(v) => set("maxDelayMs", v)}
        />
        <Slider
          label="Ratio"
          value={params.intervalRatio}
          min={0.5}
          max={8}
          step={0.1}
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

        <div className="info-row">
          <span className="info-label">Min Delay</span>
          <span className="info-value">
            {Math.round(computedMinDelay)} ms
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
