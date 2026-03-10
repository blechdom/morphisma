import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  rissetTapeDelayGraph,
  type RissetTapeDelayParams,
} from "@/synth/risset-tape-delay";
import * as engine from "@/audio/delay-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";

type Source = "mic" | "file";

const DEFAULT_PARAMS: RissetTapeDelayParams = {
  speed: 0.1,
  range: 1.0,
  directionUp: true,
  feedback: 0.4,
  dryWet: 0.5,
  inputGain: 1.0,
};

export function RissetTapeDelay() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");
  const [params, setParams] = useState<RissetTapeDelayParams>(DEFAULT_PARAMS);
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(playing);
  const sourceConnectedRef = useRef(false);
  playingRef.current = playing;

  const pitchRatio = params.directionUp
    ? 1 + params.range * params.speed
    : 1 - params.range * params.speed;
  const semitones = Math.round(12 * Math.log2(Math.max(pitchRatio, 0.01)));

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
    const graph = rissetTapeDelayGraph(params, sr);
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

  const set = <K extends keyof RissetTapeDelayParams>(
    key: K,
    value: RissetTapeDelayParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      <h1 className="site-title" style={{ color: "#7060c0" }}>
        Risset Tape Delay
      </h1>
      <p style={{ opacity: 0.7, marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        A phasor sweeps the play head across the tape. As it approaches the
        record head the audio pitch-shifts{" "}
        {params.directionUp ? "upward" : "downward"}, then the head resets
        and sweeps again.
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
          <Oscilloscope data={scopeData} color="#7060c0" width={300} height={100} />
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
          label="Speed"
          value={params.speed}
          min={0.01}
          max={2}
          step={0.01}
          unit="Hz"
          onChange={(v) => set("speed", v)}
        />
        <Slider
          label="Range"
          value={params.range}
          min={0.1}
          max={10}
          step={0.1}
          unit="s"
          onChange={(v) => set("range", v)}
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
          <span className="info-label">Pitch Shift</span>
          <span className="info-value">
            {pitchRatio.toFixed(2)}x ({semitones > 0 ? "+" : ""}{semitones} st)
          </span>
        </div>

        <Slider
          label="Feedback"
          value={params.feedback}
          min={0}
          max={0.95}
          step={0.01}
          onChange={(v) => set("feedback", v)}
        />
        <Slider
          label="Dry / Wet"
          value={params.dryWet}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set("dryWet", v)}
        />
      </div>
    </div>
  );
}
