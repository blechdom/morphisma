import { el, type NodeRepr_t } from "@elemaudio/core";

export type ModMode = "fm" | "pm";

export interface MarshmallowParams {
  mode: ModMode;
  numVoices: number;
  sweepSpeed: number;
  minRate: number;
  octaves: number;
  directionUp: boolean;
  depth: number;
  carrierFreq: number;
}

function addMany(nodes: NodeRepr_t[]): NodeRepr_t {
  if (nodes.length === 0) return el.const({ value: 0 }) as NodeRepr_t;
  if (nodes.length === 1) return nodes[0];
  if (nodes.length <= 8) return el.add(...nodes) as NodeRepr_t;
  return el.add(...nodes.slice(0, 7), addMany(nodes.slice(7))) as NodeRepr_t;
}

/**
 * 2^p via Taylor series of e^(p ln2).  6 terms, < 0.01% error for p in [0, 4].
 */
function pow2Signal(p: NodeRepr_t): NodeRepr_t {
  const x = el.mul(p, Math.LN2);
  const x2 = el.mul(x, x);
  const x3 = el.mul(x2, x);
  const x4 = el.mul(x3, x);
  const x5 = el.mul(x4, x);
  return el.add(1.0, x, el.mul(x2, 0.5), el.mul(x3, 1 / 6), el.mul(x4, 1 / 24), el.mul(x5, 1 / 120)) as NodeRepr_t;
}

export function marshmallowMedicineGraph(params: MarshmallowParams): NodeRepr_t {
  const { mode, numVoices, sweepSpeed, minRate, octaves, directionUp, depth, carrierFreq } = params;

  const safeVoices = Math.max(2, Math.min(16, Math.round(numVoices)));
  const safeMinRate = Math.max(0.05, minRate);
  const safeOctaves = Math.max(0.5, Math.min(5, octaves));

  const smoothCarrier = el.sm(el.const({ key: "mm-car", value: carrierFreq }));
  const smoothDepth = el.sm(el.const({ key: "mm-dep", value: depth }));
  const smoothMinRate = el.sm(el.const({ key: "mm-min", value: safeMinRate }));
  const sweepPhasor = el.phasor(el.sm(el.const({ key: "mm-ss", value: sweepSpeed })));

  const voices: NodeRepr_t[] = [];

  for (let i = 0; i < safeVoices; i++) {
    const offset = i / safeVoices;

    // Sweep position: shared phasor + per-voice offset, wrapped to [0,1]
    const sweepRaw = el.add(sweepPhasor, offset);
    const sweep = el.sub(sweepRaw, el.floor(sweepRaw)) as NodeRepr_t;
    const p = directionUp ? sweep : (el.sub(1.0, sweep) as NodeRepr_t);

    // Modulator rate = minRate × 2^(p × octaves)
    const rate = el.mul(smoothMinRate, pow2Signal(el.mul(p, safeOctaves)));

    // Bell envelope: peaks at sweep=0.5, zero at edges
    const bell = el.mul(
      el.add(el.sin(el.sub(el.mul(2 * Math.PI, sweep), Math.PI * 0.5)), 1.0),
      0.5
    ) as NodeRepr_t;

    // Shepard-swept modulator sine
    const mod = el.cycle(rate);

    let voiceOut: NodeRepr_t;

    if (mode === "fm") {
      // FM: instantaneous freq = carrier + depth × sin(modulator)
      // depth is in Hz (frequency deviation)
      voiceOut = el.cycle(el.add(smoothCarrier, el.mul(smoothDepth, mod))) as NodeRepr_t;
    } else {
      // PM: phase = 2π × carrier_ramp + depth × sin(modulator)
      // depth is modulation index (radians)
      const cPhase = el.phasor(smoothCarrier);
      voiceOut = el.sin(
        el.add(el.mul(2 * Math.PI, cPhase), el.mul(smoothDepth, mod))
      ) as NodeRepr_t;
    }

    voices.push(el.mul(voiceOut, bell, 2 / safeVoices) as NodeRepr_t);
  }

  return el.tanh(addMany(voices)) as NodeRepr_t;
}
