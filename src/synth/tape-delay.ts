import { el, type NodeRepr_t } from "@elemaudio/core";

export const MAX_HEADS = 8;

export interface TapeDelayParams {
  numHeads: number;
  delayTimes: number[];
  headLevels: number[];
  feedback: number;
  dryWet: number;
  inputGain: number;
}

export const DEFAULT_DELAY_TIMES = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
export const DEFAULT_HEAD_LEVELS = [1.0, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25, 0.15];

export const PRESETS: { name: string; params: TapeDelayParams }[] = [
  {
    name: "Slapback",
    params: {
      numHeads: 1,
      delayTimes: [0.08, ...DEFAULT_DELAY_TIMES.slice(1)],
      headLevels: [1.0, ...DEFAULT_HEAD_LEVELS.slice(1)],
      feedback: 0.0,
      dryWet: 0.5,
      inputGain: 1.0,
    },
  },
  {
    name: "Dotted 8th",
    params: {
      numHeads: 1,
      delayTimes: [0.375, ...DEFAULT_DELAY_TIMES.slice(1)],
      headLevels: [1.0, ...DEFAULT_HEAD_LEVELS.slice(1)],
      feedback: 0.5,
      dryWet: 0.45,
      inputGain: 1.0,
    },
  },
  {
    name: "Dub Echo",
    params: {
      numHeads: 2,
      delayTimes: [0.38, 0.76, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0],
      headLevels: [1.0, 0.6, 0.7, 0.55, 0.45, 0.35, 0.25, 0.15],
      feedback: 0.65,
      dryWet: 0.6,
      inputGain: 1.0,
    },
  },
  {
    name: "Rhythmic",
    params: {
      numHeads: 4,
      delayTimes: [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0],
      headLevels: [1.0, 0.8, 0.6, 0.4, 0.45, 0.35, 0.25, 0.15],
      feedback: 0.3,
      dryWet: 0.6,
      inputGain: 1.0,
    },
  },
  {
    name: "Cascade",
    params: {
      numHeads: 8,
      delayTimes: [0.1, 0.2, 0.35, 0.5, 0.7, 0.9, 1.15, 1.4],
      headLevels: [1.0, 0.85, 0.7, 0.6, 0.5, 0.4, 0.25, 0.15],
      feedback: 0.15,
      dryWet: 0.7,
      inputGain: 1.0,
    },
  },
  {
    name: "Scatter",
    params: {
      numHeads: 8,
      delayTimes: [0.13, 0.29, 0.43, 0.59, 0.83, 1.07, 1.31, 1.79],
      headLevels: [0.9, 0.7, 1.0, 0.5, 0.8, 0.4, 0.65, 0.3],
      feedback: 0.4,
      dryWet: 0.65,
      inputGain: 1.0,
    },
  },
  {
    name: "Ambient Wash",
    params: {
      numHeads: 4,
      delayTimes: [1.5, 2.8, 4.2, 6.0, 1.25, 1.5, 1.75, 2.0],
      headLevels: [0.8, 0.6, 0.5, 0.4, 0.45, 0.35, 0.25, 0.15],
      feedback: 0.8,
      dryWet: 0.85,
      inputGain: 1.0,
    },
  },
  {
    name: "Infinite Hold",
    params: {
      numHeads: 3,
      delayTimes: [0.5, 1.3, 2.1, 1.0, 1.25, 1.5, 1.75, 2.0],
      headLevels: [1.0, 0.7, 0.5, 0.55, 0.45, 0.35, 0.25, 0.15],
      feedback: 0.93,
      dryWet: 0.7,
      inputGain: 0.8,
    },
  },
];

const MAX_BUFFER_SECONDS = 30;

function addMany(ins: NodeRepr_t[]): NodeRepr_t {
  if (ins.length === 0) return el.const({ value: 0 }) as NodeRepr_t;
  if (ins.length === 1) return ins[0];
  if (ins.length <= 8) return el.add(...ins) as NodeRepr_t;
  return el.add(...ins.slice(0, 7), addMany(ins.slice(7))) as NodeRepr_t;
}

export function tapeDelayGraph(
  params: TapeDelayParams,
  sampleRate: number
): NodeRepr_t {
  const { numHeads, delayTimes, headLevels, feedback, dryWet, inputGain } =
    params;

  const maxBufferSamples = Math.ceil(MAX_BUFFER_SECONDS * sampleRate);

  const rawInput = el.in({ channel: 0 }) as NodeRepr_t;
  const input = el.mul(
    rawInput,
    el.sm(el.const({ key: "input-gain", value: inputGain }))
  ) as NodeRepr_t;

  // Feedback: mixed play-head output feeds back to record head
  const smoothFeedback = el.sm(
    el.const({ key: "tape-feedback", value: feedback })
  );
  const fbSignal = el.tapIn({ name: "tape-fb" }) as NodeRepr_t;
  const toBuffer = el.add(
    input,
    el.mul(fbSignal, smoothFeedback)
  ) as NodeRepr_t;

  // Each play head reads from the same buffer content at a different offset.
  // Smoothing the delay signals gives tape-like pitch artifacts when a
  // head's position changes — just like speeding / slowing real tape.
  const heads: NodeRepr_t[] = [];

  for (let i = 0; i < numHeads; i++) {
    const dt = delayTimes[i] ?? DEFAULT_DELAY_TIMES[i] ?? 0.5;
    const level = headLevels[i] ?? DEFAULT_HEAD_LEVELS[i] ?? 1.0;

    const delaySamples = Math.max(
      1,
      Math.min(Math.round(dt * sampleRate), maxBufferSamples - 1)
    );

    const smoothDelay = el.sm(
      el.const({ key: `head-${i}-delay`, value: delaySamples })
    );
    const smoothLevel = el.sm(
      el.const({ key: `head-${i}-level`, value: level })
    );

    const playHead = el.delay(
      { size: maxBufferSamples },
      smoothDelay,
      0,
      toBuffer
    ) as NodeRepr_t;

    heads.push(el.mul(playHead, smoothLevel) as NodeRepr_t);
  }

  const wetRaw = addMany(heads);

  // Route mixed heads back through the feedback tap
  const wetTapped = el.tapOut({ name: "tape-fb" }, wetRaw) as NodeRepr_t;

  // Dry / wet mix
  const dry = el.mul(
    input,
    el.sm(el.const({ key: "tape-dry", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wet = el.mul(
    wetRaw,
    el.sm(el.const({ key: "tape-wet", value: dryWet }))
  ) as NodeRepr_t;

  // Keep tapOut in graph so the feedback loop stays alive
  const fbSink = el.mul(wetTapped, 0) as NodeRepr_t;

  return el.add(dry, wet, fbSink) as NodeRepr_t;
}
