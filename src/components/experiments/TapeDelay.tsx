import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  tapeDelayGraph,
  MAX_HEADS,
  PRESETS,
  DEFAULT_DELAY_TIMES,
  DEFAULT_HEAD_LEVELS,
  type TapeDelayParams,
} from "@/synth/tape-delay";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";

type Source = "mic" | "file";

const HEAD_COLORS = [
  "#e0a030",
  "#30b0e0",
  "#e05050",
  "#50c070",
  "#b060d0",
  "#20c8c8",
  "#e07090",
  "#d09030",
];

const DEFAULT_PARAMS: TapeDelayParams = {
  numHeads: 1,
  delayTimes: [...DEFAULT_DELAY_TIMES],
  headLevels: [...DEFAULT_HEAD_LEVELS],
  feedback: 0.4,
  dryWet: 0.5,
  inputGain: 1.0,
};

export function TapeDelay() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");
  const [params, setParams] = useState<TapeDelayParams>(DEFAULT_PARAMS);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(playing);
  const sourceConnectedRef = useRef(false);
  playingRef.current = playing;

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
    const graph = tapeDelayGraph(params, sr);
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

  const set = <K extends keyof TapeDelayParams>(
    key: K,
    value: TapeDelayParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const setHeadDelay = (index: number, value: number) => {
    setParams((prev) => {
      const arr = [...prev.delayTimes];
      arr[index] = value;
      return { ...prev, delayTimes: arr };
    });
  };

  const setHeadLevel = (index: number, value: number) => {
    setParams((prev) => {
      const arr = [...prev.headLevels];
      arr[index] = value;
      return { ...prev, headLevels: arr };
    });
  };

  const applyPreset = (index: number) => {
    setParams({ ...PRESETS[index].params });
  };

  return (
    <div>
      <h1 className="site-title" style={{ color: "#e0a030" }}>
        Multi-Head Tape Delay
      </h1>
      <p style={{ opacity: 0.7, marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        Circular buffer with a record head and up to {MAX_HEADS} movable play
        heads. Drag each head's <em>Delay Time</em> to sweep it across the tape.
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
          <Oscilloscope
            data={scopeData}
            color="#e0a030"
            width={300}
            height={100}
          />
        </div>
      </div>

      <div className="presets">
        <span className="presets-label">Presets</span>
        {PRESETS.map((p, i) => (
          <button
            key={i}
            className="preset-btn"
            onClick={() => applyPreset(i)}
            title={p.name}
          >
            {p.name}
          </button>
        ))}
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
          max={0.95}
          step={0.01}
          onChange={(v) => set("feedback", v)}
        />
        <Slider
          label="Play Heads"
          value={params.numHeads}
          min={1}
          max={MAX_HEADS}
          step={1}
          onChange={(v) => set("numHeads", v)}
        />
      </div>

      <div className="heads-grid">
        {Array.from({ length: params.numHeads }, (_, i) => (
          <div
            key={i}
            className="head-card"
            style={{ borderColor: HEAD_COLORS[i] }}
          >
            <span className="head-label" style={{ color: HEAD_COLORS[i] }}>
              Head {i + 1}
            </span>
            <Slider
              label="Time"
              value={Math.round((params.delayTimes[i] ?? DEFAULT_DELAY_TIMES[i]) * 1000)}
              min={10}
              max={10000}
              step={1}
              unit="ms"
              onChange={(v) => setHeadDelay(i, v / 1000)}
            />
            <Slider
              label="Level"
              value={params.headLevels[i] ?? DEFAULT_HEAD_LEVELS[i]}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => setHeadLevel(i, v)}
            />
          </div>
        ))}
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
   (+)◄──────────── mixed head output × feedback (global loop via tapIn/tapOut)
    │                        ▲
    ▼                        │
  [write to buffer]          │
    │                        │
    ├─── [head 0: read at delayTime₀] ──► × level₀ ──┐
    ├─── [head 1: read at delayTime₁] ──► × level₁ ──┤
    ├─── ...                                           ├──► mixed heads
    └─── [head N: read at delayTimeₙ] ──► × levelₙ ──┘        │
                                                               │
                                                          tapOut ──► feeds back
                                                               │
                                                        wet × dryWet
                                                               │
    input × (1 - dryWet) ──────────────────────────►(+)◄───────┘
                                                     │
                                                     ▼
                                                  output

  Each head reads at a fixed delay time (adjustable).
  The mixed output of all heads feeds back globally.
  Moving a head's delay time produces tape-style pitch artifacts.
`}</pre>
    </div>
  );
}
