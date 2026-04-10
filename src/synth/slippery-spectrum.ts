import { el, type NodeRepr_t } from "@elemaudio/core";

export const MAX_BANDS = 48;
export const MAX_VOICES_PER_BAND = 8;

export interface SlipperySpectrumParams {
  numBands: number;
  voicesPerBand: number;
  speed: number;
  sweepOctaves: number;
  directionUp: boolean;
  bandMagnitudes: number[];
  lowFreq: number;
  highFreq: number;
  dryWet: number;
  inputGain: number;
}

function addMany(ins: NodeRepr_t[]): NodeRepr_t {
  if (ins.length === 0) return el.const({ value: 0 }) as NodeRepr_t;
  if (ins.length === 1) return ins[0];
  if (ins.length <= 8) return el.add(...ins) as NodeRepr_t;
  return el.add(...ins.slice(0, 7), addMany(ins.slice(7))) as NodeRepr_t;
}

export function computeBandFreqs(
  numBands: number,
  lowFreq: number,
  highFreq: number
): number[] {
  const freqs: number[] = [];
  for (let i = 0; i < numBands; i++) {
    const t = numBands > 1 ? i / (numBands - 1) : 0.5;
    freqs.push(lowFreq * Math.pow(highFreq / lowFreq, t));
  }
  return freqs;
}

/**
 * Map FFT magnitude data (dB, from AnalyserNode) into N log-spaced bands.
 * Returns an array of linear amplitudes (0–1) per band.
 */
export function fftToBands(
  fftData: Float32Array,
  numBands: number,
  lowFreq: number,
  highFreq: number,
  sampleRate: number,
  fftSize: number
): number[] {
  const binHz = sampleRate / fftSize;
  const freqs = computeBandFreqs(numBands, lowFreq, highFreq);
  const bands: number[] = [];

  for (let b = 0; b < numBands; b++) {
    const cf = freqs[b];
    const bwOctaves =
      numBands > 1 ? Math.log2(highFreq / lowFreq) / (numBands - 1) : 2;
    const lo = cf / Math.pow(2, bwOctaves / 2);
    const hi = cf * Math.pow(2, bwOctaves / 2);
    const binLo = Math.max(0, Math.floor(lo / binHz));
    const binHi = Math.min(fftData.length - 1, Math.ceil(hi / binHz));

    let sum = -120;
    let count = 0;
    for (let k = binLo; k <= binHi; k++) {
      sum = Math.max(sum, fftData[k]);
      count++;
    }
    if (count === 0) {
      bands.push(0);
      continue;
    }
    const db = sum;
    const minDb = -60;
    const maxDb = -10;
    const linear = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
    bands.push(linear * linear);
  }
  return bands;
}

export function slipperySpectrumGraph(
  params: SlipperySpectrumParams
): NodeRepr_t {
  const {
    numBands,
    voicesPerBand,
    speed,
    sweepOctaves,
    directionUp,
    bandMagnitudes,
    lowFreq,
    highFreq,
    dryWet,
    inputGain,
  } = params;

  const rawInput = el.in({ channel: 0 }) as NodeRepr_t;
  const input = el.mul(
    rawInput,
    el.sm(el.const({ key: "ss-gain", value: inputGain }))
  ) as NodeRepr_t;

  const bandFreqs = computeBandFreqs(numBands, lowFreq, highFreq);

  const smoothSpeed = el.sm(el.const({ key: "ss-speed", value: speed }));
  const dir = el.sm(
    el.const({ key: "ss-dir", value: directionUp ? 1.0 : 0.0 })
  );
  const invDir = el.sub(1.0, dir);
  const voiceGain = 2 / voicesPerBand;

  const bandOutputs: NodeRepr_t[] = [];

  for (let b = 0; b < numBands; b++) {
    const cf = bandFreqs[b];
    const mag = bandMagnitudes[b] ?? 0;

    const smoothMag = el.sm(
      el.const({ key: `ss-mag-${b}`, value: mag })
    );

    const halfSweep = sweepOctaves / 2;
    const freqLow = cf / Math.pow(2, halfSweep);
    const freqHigh = cf * Math.pow(2, halfSweep);
    const freqRange = freqHigh - freqLow;

    const voices: NodeRepr_t[] = [];

    for (let v = 0; v < voicesPerBand; v++) {
      const phaseOffset = v / voicesPerBand;

      const raw = el.phasor(smoothSpeed);
      const shifted = el.add(
        raw,
        el.const({ key: `ss-ph-${b}-${v}`, value: phaseOffset })
      );
      const phasor = el.sub(shifted, el.floor(shifted));

      const expCurve = el.sub(
        el.pow(2, el.sub(1.0, phasor)),
        1.0
      );
      const curve = el.add(
        el.mul(dir, expCurve),
        el.mul(invDir, el.sub(1.0, expCurve))
      );

      const freq = el.add(
        el.const({ key: `ss-flo-${b}-${v}`, value: freqLow }),
        el.mul(curve, el.const({ key: `ss-frng-${b}-${v}`, value: freqRange }))
      );

      const osc = el.cycle(freq);

      const hann = el.mul(
        0.5,
        el.sub(1.0, el.cos(el.mul(2 * Math.PI, phasor)))
      );

      voices.push(
        el.mul(el.mul(osc, hann), voiceGain) as NodeRepr_t
      );
    }

    const bandShepard = addMany(voices);
    bandOutputs.push(
      el.mul(bandShepard, smoothMag) as NodeRepr_t
    );
  }

  const wet = addMany(bandOutputs);
  const wetNormed = el.mul(
    wet,
    el.sm(el.const({ key: "ss-wnorm", value: 1 / Math.sqrt(numBands) }))
  ) as NodeRepr_t;

  const drySignal = el.mul(
    input,
    el.sm(el.const({ key: "ss-dry", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wetSignal = el.mul(
    wetNormed,
    el.sm(el.const({ key: "ss-wet", value: dryWet }))
  ) as NodeRepr_t;

  return el.add(drySignal, wetSignal) as NodeRepr_t;
}
