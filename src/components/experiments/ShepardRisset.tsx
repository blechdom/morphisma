import { useCallback, useEffect, useRef, useState } from "react";
import { el, type NodeRepr_t } from "@elemaudio/core";
import {
  shepardRissetGraph,
  type ShepardParams,
} from "@/synth/shepard-risset";
import * as engine from "@/audio/glissando-engine";
import { Oscilloscope } from "@/components/Oscilloscope";
import { Slider } from "@/components/Slider";

type Preset = [number, number, number, number, boolean];

const PRESETS: Preset[] = [
  [8, 0.05, 100, 2.0, true],
  [8, 0.05, 200, 1.5, false],
  [2, 5.0, 135, 3.7, true],
  [8, 0.06, 660, 0.12, false],
  [6, 0.75, 212, 4.0, true],
];

function presetToParams(p: Preset): ShepardParams {
  return {
    numVoices: p[0],
    speed: p[1],
    startFreq: p[2],
    intervalRatio: p[3],
    directionUp: p[4],
  };
}

export function ShepardRisset() {
  const [playing, setPlaying] = useState(false);
  const [gain, setGain] = useState(0.0);
  const [params, setParams] = useState<ShepardParams>(
    presetToParams(PRESETS[0])
  );
  const [scopeData, setScopeData] = useState<Float32Array | number[]>([]);

  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    engine.onScope((data) => {
      if (playingRef.current) setScopeData(data);
    });
    return () => {
      engine.suspend();
    };
  }, []);

  const buildAndRender = useCallback(() => {
    if (!playing) return;
    const dry = shepardRissetGraph(params);
    const gained = el.mul(
      dry,
      el.sm(el.const({ key: "main-gain", value: gain }))
    ) as NodeRepr_t;
    const scoped = el.scope({ name: "scope" }, gained);
    engine.render(scoped as NodeRepr_t);
  }, [playing, params, gain]);

  useEffect(() => {
    buildAndRender();
  }, [buildAndRender]);

  const togglePlay = async () => {
    if (!playing) {
      await engine.ensureInitialized();
      engine.resume();
      setPlaying(true);
    } else {
      engine.suspend();
      setPlaying(false);
      setScopeData([]);
    }
  };

  const applyPreset = (index: number) => {
    setParams(presetToParams(PRESETS[index]));
  };

  const set = <K extends keyof ShepardParams>(
    key: K,
    value: ShepardParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      <h1 className="site-title" style={{ color: "#ff4444" }}>Shepard-Risset Glissando</h1>

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
          label="Gain"
          value={gain}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setGain(v)}
        />
        <Slider
          label="Voices"
          value={params.numVoices}
          min={1}
          max={64}
          step={1}
          onChange={(v) => set("numVoices", v)}
        />
        <Slider
          label="Speed"
          value={params.speed}
          min={0.01}
          max={10}
          step={0.01}
          onChange={(v) => set("speed", v)}
        />
        <Slider
          label="Start Freq"
          value={params.startFreq}
          min={10}
          max={3000}
          step={1}
          unit="Hz"
          onChange={(v) => set("startFreq", v)}
        />
        <Slider
          label="Interval Ratio"
          value={params.intervalRatio}
          min={0.01}
          max={8}
          step={0.01}
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
      </div>

      <div className="presets">
        <span className="presets-label">Presets</span>
        {PRESETS.map((_, i) => (
          <button
            key={i}
            className="preset-btn"
            onClick={() => applyPreset(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
