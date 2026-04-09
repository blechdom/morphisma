import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  simpleTapeDelayGraph,
  type SimpleTapeDelayParams,
} from "@/synth/simple-tape-delay";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";
import { Mermaid } from "@/components/Mermaid";

type Source = "mic" | "file";

interface Preset {
  name: string;
  delayTime: number;
  feedback: number;
  dryWet: number;
  inputGain: number;
}

const PRESETS: Preset[] = [
  { name: "Slapback",    delayTime: 0.08,  feedback: 0.0,  dryWet: 0.5,  inputGain: 1.0 },
  { name: "Short Echo",  delayTime: 0.25,  feedback: 0.4,  dryWet: 0.5,  inputGain: 1.0 },
  { name: "Quarter Note", delayTime: 0.5,  feedback: 0.5,  dryWet: 0.5,  inputGain: 1.0 },
  { name: "Long Repeat", delayTime: 1.0,   feedback: 0.6,  dryWet: 0.6,  inputGain: 1.0 },
  { name: "Infinite",    delayTime: 0.5,   feedback: 0.93, dryWet: 0.7,  inputGain: 0.8 },
];

export function SimpleTapeDelay() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");

  const [delayTime, setDelayTime] = useState(0.25);
  const [feedback, setFeedback] = useState(0.4);
  const [dryWet, setDryWet] = useState(0.5);
  const [inputGain, setInputGain] = useState(1.0);

  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(playing);
  const sourceConnectedRef = useRef(false);
  playingRef.current = playing;

  const tapTimesRef = useRef<number[]>([]);

  const params: SimpleTapeDelayParams = {
    delayTime,
    feedback,
    dryWet,
    inputGain,
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
    const graph = simpleTapeDelayGraph(params, sr);
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
    setDelayTime(p.delayTime);
    setFeedback(p.feedback);
    setDryWet(p.dryWet);
    setInputGain(p.inputGain);
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
    setDelayTime(Math.min(10, Math.max(0.001, avgMs / 1000)));
  };

  return (
    <div>
      <h1 className="site-title" style={{ color: "#40a8e0" }}>
        Simple Tape Delay
      </h1>
      <p style={{ opacity: 0.7, marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        One circular buffer, one read head, one feedback path — the
        fundamental building block of all the other delay experiments.
      </p>

      <Mermaid chart={`graph TD
  IN["Input -- mic / file"] -->|"x gain"| PLUS["(+) mix"]
  FB_OUT -->|"x feedback"| PLUS
  PLUS --> WRITE["Write to buffer"]
  WRITE --> READ["Read at delayTime"]
  READ --> FB_OUT["tapOut -- feedback path"]
  READ -->|"x dryWet"| WET["Wet signal"]
  IN -->|"x 1 - dryWet"| DRY["Dry signal"]
  DRY --> MIX["(+) output mix"]
  WET --> MIX
  MIX --> OUT["Output"]
`} />

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
          <Oscilloscope data={scopeData} color="#40a8e0" width={300} height={100} />
        </div>
      </div>

      <div className="presets">
        <span className="presets-label">Presets</span>
        {PRESETS.map((p, i) => (
          <button
            key={i}
            className="preset-btn"
            onClick={() => applyPreset(p)}
            title={p.name}
          >
            {p.name}
          </button>
        ))}
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ flex: 1 }}>
            <Slider
              label="Delay Time"
              value={delayTime}
              min={0.001}
              max={10}
              step={0.001}
              unit="s"
              curve={2}
              onChange={setDelayTime}
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
            title="Tap repeatedly to set delay from tempo"
          >
            Tap
          </button>
        </div>
        <Slider
          label="Feedback"
          value={feedback}
          min={0}
          max={0.95}
          step={0.01}
          onChange={setFeedback}
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
    </div>
  );
}
