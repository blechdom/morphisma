import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  slipperySpectrumGraph,
  fftToBands,
  MAX_BANDS,
  MAX_VOICES_PER_BAND,
  type SlipperySpectrumParams,
} from "@/synth/slippery-spectrum";
import * as engine from "@/audio/spectrum-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";
import { Mermaid } from "@/components/Mermaid";

type Source = "mic" | "file";

const ACCENT = "#30ccaa";

interface Preset {
  name: string;
  numBands: number;
  voicesPerBand: number;
  speed: number;
  sweepOctaves: number;
  directionUp: boolean;
  lowFreq: number;
  highFreq: number;
  dryWet: number;
}

const BUILT_IN_PRESETS: Preset[] = [
  { name: "Faithful Rise",    numBands: 32, voicesPerBand: 4, speed: 0.1,  sweepOctaves: 1,   directionUp: true,  lowFreq: 80,   highFreq: 8000,  dryWet: 0.85 },
  { name: "Faithful Fall",    numBands: 32, voicesPerBand: 4, speed: 0.1,  sweepOctaves: 1,   directionUp: false, lowFreq: 80,   highFreq: 8000,  dryWet: 0.85 },
  { name: "Gentle Rise",      numBands: 20, voicesPerBand: 4, speed: 0.3,  sweepOctaves: 2,   directionUp: true,  lowFreq: 80,   highFreq: 6000,  dryWet: 0.8 },
  { name: "Wide Spectrum",    numBands: 32, voicesPerBand: 4, speed: 0.15, sweepOctaves: 2,   directionUp: true,  lowFreq: 60,   highFreq: 10000, dryWet: 0.9 },
  { name: "Tight Vocal",      numBands: 16, voicesPerBand: 6, speed: 0.5,  sweepOctaves: 1,   directionUp: true,  lowFreq: 200,  highFreq: 3500,  dryWet: 0.7 },
  { name: "Ghost",             numBands: 40, voicesPerBand: 4, speed: 0.05, sweepOctaves: 1.5, directionUp: true,  lowFreq: 60,   highFreq: 12000, dryWet: 1.0 },
  { name: "Falling Whisper",  numBands: 24, voicesPerBand: 6, speed: 0.2,  sweepOctaves: 2,   directionUp: false, lowFreq: 100,  highFreq: 4000,  dryWet: 0.85 },
  { name: "Fast Shimmer",     numBands: 16, voicesPerBand: 4, speed: 2.0,  sweepOctaves: 2,   directionUp: true,  lowFreq: 400,  highFreq: 8000,  dryWet: 0.9 },
  { name: "Deep Descent",     numBands: 16, voicesPerBand: 6, speed: 0.1,  sweepOctaves: 3,   directionUp: false, lowFreq: 40,   highFreq: 2000,  dryWet: 1.0 },
  { name: "Hi-Res Subtle",    numBands: 48, voicesPerBand: 2, speed: 0.08, sweepOctaves: 0.5, directionUp: true,  lowFreq: 60,   highFreq: 12000, dryWet: 0.9 },
  { name: "Liquid",            numBands: 24, voicesPerBand: 4, speed: 1.0,  sweepOctaves: 2,   directionUp: true,  lowFreq: 100,  highFreq: 6000,  dryWet: 0.8 },
  { name: "Thick & Low",      numBands: 20, voicesPerBand: 6, speed: 0.15, sweepOctaves: 2,   directionUp: false, lowFreq: 30,   highFreq: 1000,  dryWet: 0.9 },
];

export function SlipperySpectrum() {
  const [playing, setPlaying] = useState(false);
  const [outputVol, setOutputVol] = useState(0.5);
  const [source, setSource] = useState<Source>("file");
  const [fileUrl, setFileUrl] = useState("");

  const [numBands, setNumBands] = useState(32);
  const [voicesPerBand, setVoicesPerBand] = useState(4);
  const [speed, setSpeed] = useState(0.1);
  const [sweepOctaves, setSweepOctaves] = useState(1);
  const [dirUp, setDirUp] = useState(true);
  const [lowFreq, setLowFreq] = useState(80);
  const [highFreq, setHighFreq] = useState(8000);
  const [dryWet, setDryWet] = useState(0.85);
  const [inputGain, setInputGain] = useState(1.0);

  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);
  const [bandLevels, setBandLevels] = useState<number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(playing);
  const sourceConnectedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const fftBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  playingRef.current = playing;

  const paramsRef = useRef<Omit<SlipperySpectrumParams, "bandMagnitudes">>({
    numBands, voicesPerBand, speed, sweepOctaves, directionUp: dirUp,
    lowFreq, highFreq, dryWet, inputGain,
  });
  paramsRef.current = {
    numBands, voicesPerBand, speed, sweepOctaves, directionUp: dirUp,
    lowFreq, highFreq, dryWet, inputGain,
  };

  useEffect(() => {
    engine.onScope((data) => {
      if (playingRef.current) setScopeData(data);
    });
    return () => {
      cancelAnimationFrame(rafRef.current);
      engine.disconnectSource();
      engine.suspend();
    };
  }, []);

  const renderGraph = useCallback((mags: number[]) => {
    if (!playingRef.current) return;
    const p = paramsRef.current;
    const graph = slipperySpectrumGraph({ ...p, bandMagnitudes: mags });
    const gained = el.mul(
      graph,
      el.sm(el.const({ key: "output-vol", value: outputVol }))
    ) as NodeRepr_t;
    const scoped = el.scope({ name: "scope" }, gained);
    engine.render(scoped as NodeRepr_t);
  }, [outputVol]);

  const startFFTLoop = useCallback(() => {
    const tick = () => {
      if (!playingRef.current) return;
      const an = engine.getAnalyser();
      if (!an) { rafRef.current = requestAnimationFrame(tick); return; }

      if (!fftBufRef.current || fftBufRef.current.length !== an.frequencyBinCount) {
        fftBufRef.current = new Float32Array(an.frequencyBinCount);
      }
      an.getFloatFrequencyData(fftBufRef.current);

      const p = paramsRef.current;
      const sr = engine.getSampleRate();
      const mags = fftToBands(
        fftBufRef.current, p.numBands, p.lowFreq, p.highFreq, sr, an.fftSize
      );
      setBandLevels(mags);
      renderGraph(mags);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [renderGraph]);

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
      playingRef.current = true;
      startFFTLoop();
    } else {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
      engine.disconnectSource();
      sourceConnectedRef.current = false;
      engine.suspend();
      setPlaying(false);
      setScopeData([]);
      setBandLevels([]);
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
    setNumBands(p.numBands);
    setVoicesPerBand(p.voicesPerBand);
    setSpeed(p.speed);
    setSweepOctaves(p.sweepOctaves);
    setDirUp(p.directionUp);
    setLowFreq(p.lowFreq);
    setHighFreq(p.highFreq);
    setDryWet(p.dryWet);
  };

  return (
    <div className="slippery-spectrum-page">
      <style>{`
        .slippery-spectrum-page input[type="range"]::-webkit-slider-thumb { background: ${ACCENT} !important; }
        .slippery-spectrum-page input[type="range"]::-moz-range-thumb { background: ${ACCENT} !important; }
        .slippery-spectrum-page .play-btn { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .slippery-spectrum-page .play-btn:hover { background: ${ACCENT} !important; color: #0a0a0a !important; }
        .slippery-spectrum-page .source-btn.active { background: ${ACCENT} !important; border-color: ${ACCENT} !important; }
      `}</style>

      <h1 className="site-title" style={{ color: ACCENT }}>
        Slippery Spectrum
      </h1>
      <p style={{ opacity: 0.7, marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        FFT analysis splits the input into {numBands} frequency bands.
        Each band drives a Shepard-Risset glissando of {voicesPerBand} voices
        — the spectrum endlessly {dirUp ? "rises" : "falls"}, resynthesized from the original signal.
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
          <Oscilloscope data={scopeData} color={ACCENT} width={300} height={100} />
        </div>
      </div>

      {bandLevels.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "2px",
            height: "60px",
            padding: "0.5rem 0",
            marginBottom: "0.5rem",
          }}
        >
          {bandLevels.map((lvl, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${Math.max(2, lvl * 100)}%`,
                background: ACCENT,
                opacity: 0.3 + lvl * 0.7,
                borderRadius: "2px 2px 0 0",
                transition: "height 0.06s, opacity 0.06s",
              }}
            />
          ))}
        </div>
      )}

      <div className="presets">
        <span className="presets-label">Presets</span>
        {BUILT_IN_PRESETS.map((p, i) => (
          <button
            key={i}
            className="preset-btn"
            onClick={() => applyPreset(p)}
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
        <Slider
          label="Bands"
          value={numBands}
          min={2}
          max={MAX_BANDS}
          step={1}
          onChange={setNumBands}
        />
        <Slider
          label="Voices / Band"
          value={voicesPerBand}
          min={2}
          max={MAX_VOICES_PER_BAND}
          step={1}
          onChange={setVoicesPerBand}
        />
        <Slider
          label="Speed"
          value={speed}
          min={0}
          max={5}
          step={0.001}
          unit="Hz"
          curve={2}
          onChange={setSpeed}
        />
        <label style={{
          display: "flex", alignItems: "center", gap: "0.35rem",
          fontSize: "0.7rem", color: "#777", cursor: "pointer",
          userSelect: "none", padding: "0 0 0 0.25rem",
        }}>
          <input
            type="checkbox"
            checked={dirUp}
            onChange={(e) => setDirUp(e.target.checked)}
            style={{ accentColor: ACCENT }}
          />
          {dirUp ? "Up" : "Down"}
        </label>
        <Slider
          label="Sweep"
          value={sweepOctaves}
          min={0.5}
          max={4}
          step={0.1}
          unit="oct"
          onChange={setSweepOctaves}
        />
        <Slider
          label="Low Freq"
          value={lowFreq}
          min={20}
          max={2000}
          step={1}
          unit="Hz"
          curve={2}
          onChange={setLowFreq}
        />
        <Slider
          label="High Freq"
          value={highFreq}
          min={1000}
          max={16000}
          step={1}
          unit="Hz"
          curve={2}
          onChange={setHighFreq}
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
  IN["Input — mic / file"] -->|"× gain"| SRC["Source signal"]
  SRC --> AN["Web Audio AnalyserNode — FFT"]
  SRC --> ELEM["Elementary Audio graph"]
  AN -->|"frequencyData at ~60 fps"| JS["JavaScript: group FFT bins into N log-spaced bands"]
  JS -->|"band magnitudes 0–1"| ELEM
  ELEM --> B0["Band 0: Shepard gliss at center freq"]
  ELEM --> B1["Band 1: Shepard gliss at center freq"]
  ELEM --> BN["Band N: Shepard gliss at center freq"]
  B0 -->|"× band 0 magnitude"| SUM["Sum all bands"]
  B1 -->|"× band 1 magnitude"| SUM
  BN -->|"× band N magnitude"| SUM
  SUM -->|"÷ √N normalize"| WET["Wet signal"]
  SRC -->|"× 1 − dryWet"| DRY["Dry signal"]
  WET -->|"× dryWet"| MIX["Output mix"]
  DRY --> MIX

  subgraph BAND ["Each Band — Shepard-Risset Glissando"]
    P0["Voice 0: phasor + phase offset"] -->|"exp curve"| OSC0["el.cycle — sine at swept freq"]
    P1["Voice 1: phasor + phase offset"] -->|"exp curve"| OSC1["el.cycle — sine at swept freq"]
    PV["Voice V: phasor + phase offset"] -->|"exp curve"| OSCV["el.cycle — sine at swept freq"]
    OSC0 -->|"× Hann window"| BSUM["Sum voices"]
    OSC1 -->|"× Hann window"| BSUM
    OSCV -->|"× Hann window"| BSUM
  end
`} />
    </div>
  );
}
