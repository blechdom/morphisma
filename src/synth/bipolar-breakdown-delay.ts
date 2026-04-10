import { el, type NodeRepr_t } from "@elemaudio/core";

export type Direction = "forward" | "backward" | "boomerang";
export type AnchorMode = "fixed" | "tracking";

export interface BipolarBreakdownDelayParams {
  direction: Direction;
  anchorMode: AnchorMode;
  numVoices: number;
  fullSweep: boolean;
  speed: number;
  startDelay: number;
  minDelay: number;
  initRate: number;
  accel: number;
  maxPasses: number;
  feedback: number;
  fbDelay: number;
  globalFeedback: number;
  dryWet: number;
  inputGain: number;
  resetCount: number;
}

const MAX_BUFFER_SECONDS = 30;
const MAX_VOICES = 12;

function elMax(a: NodeRepr_t, b: NodeRepr_t): NodeRepr_t {
  return el.mul(0.5, el.add(el.add(a, b), el.abs(el.sub(a, b)))) as NodeRepr_t;
}

function elMin(a: NodeRepr_t, b: NodeRepr_t): NodeRepr_t {
  return el.mul(0.5, el.sub(el.add(a, b), el.abs(el.sub(a, b)))) as NodeRepr_t;
}

function addMany(ins: NodeRepr_t[]): NodeRepr_t {
  if (ins.length === 0) return el.const({ value: 0 }) as NodeRepr_t;
  if (ins.length === 1) return ins[0];
  if (ins.length <= 8) return el.add(...ins) as NodeRepr_t;
  return el.add(...ins.slice(0, 7), addMany(ins.slice(7))) as NodeRepr_t;
}

export function bipolarBreakdownDelayGraph(
  params: BipolarBreakdownDelayParams,
  sampleRate: number
): NodeRepr_t {
  const {
    direction, anchorMode, numVoices, fullSweep,
    speed, startDelay, minDelay, initRate, accel, maxPasses,
    feedback, fbDelay, globalFeedback, dryWet, inputGain, resetCount,
  } = params;

  const maxBufferSamples = Math.ceil(MAX_BUFFER_SECONDS * sampleRate);
  const fbDelaySamples = Math.max(1, Math.round(fbDelay * sampleRate));
  const safeSpeed = Math.max(0.001, speed);
  const safeMaxPasses = Math.max(1, Math.round(maxPasses));
  const safeNumVoices = Math.max(1, Math.min(MAX_VOICES, Math.round(numVoices)));

  const rawInput = el.in({ channel: 0 }) as NodeRepr_t;
  const input = el.mul(
    rawInput,
    el.sm(el.const({ key: "input-gain", value: inputGain }))
  ) as NodeRepr_t;

  const smoothFeedback = el.sm(el.const({ key: "bbd-feedback", value: feedback }));
  const smoothGlobalFb = el.sm(el.const({ key: "bbd-gfb", value: globalFeedback }));
  const fbSignal = el.tapIn({ name: "bbd-fb" }) as NodeRepr_t;
  const globalFbSignal = el.tapIn({ name: "bbd-gfb-tap" }) as NodeRepr_t;

  // Soft-clip the buffer input with tanh to prevent feedback runaway
  const bufferSum = el.add(
    input,
    el.mul(fbSignal, smoothFeedback),
    el.mul(globalFbSignal, smoothGlobalFb)
  ) as NodeRepr_t;
  const toBuffer = el.tanh(bufferSum) as NodeRepr_t;

  const fbHead = el.delay(
    { size: maxBufferSamples },
    el.sm(el.const({ key: "bbd-fb-delay", value: fbDelaySamples })),
    0,
    toBuffer
  );
  const fbTapped = el.tapOut({ name: "bbd-fb" }, fbHead) as NodeRepr_t;
  const fbSink = el.mul(fbTapped, 0) as NodeRepr_t;

  // Elapsed time: 0 → MAX_BUFFER_SECONDS.
  // Keyed on resetCount so incrementing it spawns a fresh phasor at 0.
  const elapsed = el.mul(
    el.phasor(el.const({ key: `bbd-elapsed-freq-${resetCount}`, value: 1 / MAX_BUFFER_SECONDS })),
    MAX_BUFFER_SECONDS
  );

  // --- Pass / cycle structure ---
  const smoothSpeed = el.sm(el.const({ key: "bbd-speed", value: safeSpeed }));
  const passTotal = el.mul(elapsed, smoothSpeed);
  const passPhaseBase = el.sub(passTotal, el.floor(passTotal));

  const cycleTotal = el.mul(passTotal, 1 / safeMaxPasses);
  const cyclePhase = el.sub(cycleTotal, el.floor(cycleTotal));
  const passIndex = el.floor(el.mul(cyclePhase, safeMaxPasses));

  // --- Rate (for rate-controlled mode, accel can be negative) ---
  const smoothInitRate = el.sm(el.const({ key: "bbd-init-rate", value: initRate }));
  const smoothAccel = el.sm(el.const({ key: "bbd-accel", value: accel }));
  const currentRate = el.add(smoothInitRate, el.mul(passIndex, smoothAccel));

  // --- Shared signals ---
  const smoothSD = el.sm(el.const({ key: "bbd-sd", value: startDelay }));
  const smoothMinDel = el.sm(el.const({ key: "bbd-min-del-sec", value: minDelay }));
  const isFixedVal = anchorMode === "fixed" ? 1.0 : 0.0;
  const smoothFixed = el.sm(el.const({ key: "bbd-fixed", value: isFixedVal }));

  const zero = el.const({ key: "bbd-zero", value: 0 }) as NodeRepr_t;
  const one = el.const({ key: "bbd-one", value: 1 }) as NodeRepr_t;
  const passDur = el.sm(el.const({ key: "bbd-pas-dur", value: 1 / safeSpeed }));
  const rateSweepRange = elMax(zero, el.mul(el.sub(currentRate, 1.0), passDur));

  const isFullVal = fullSweep ? 1.0 : 0.0;
  const smoothFull = el.sm(el.const({ key: "bbd-full-sweep", value: isFullVal }));

  // --- Direction weights ---
  const isFwd = direction === "forward" ? 1.0 : 0.0;
  const isBwd = direction === "backward" ? 1.0 : 0.0;
  const isBoom = direction === "boomerang" ? 1.0 : 0.0;
  const smoothDirFwd = el.sm(el.const({ key: "dir-fwd", value: isFwd }));
  const smoothDirBwd = el.sm(el.const({ key: "dir-bwd", value: isBwd }));
  const smoothDirBoom = el.sm(el.const({ key: "dir-boom", value: isBoom }));

  const voiceGain = 2 / MAX_VOICES;
  // Minimum 64 samples (~1.3ms at 48kHz) to avoid comb-filter bombs with feedback
  const clampMin = el.const({ key: "bbd-clamp-min", value: 64 }) as NodeRepr_t;
  const clampMax = el.const({ key: "bbd-clamp-max", value: maxBufferSamples - 1 }) as NodeRepr_t;

  const cycleDurSec = safeMaxPasses / safeSpeed;

  // ALWAYS create MAX_VOICES nodes so the graph topology never changes.
  // Voices beyond safeNumVoices get alive=0 (silent but present in the graph).
  function voice(index: number): NodeRepr_t {
    const isActive = index < safeNumVoices;
    const birthPhase = isActive ? index / safeNumVoices : 1.0;
    const birthConst = el.const({ key: `bbd-birth-${index}`, value: birthPhase });

    const rawAge = el.sub(cyclePhase, birthConst);
    const age = elMax(zero, rawAge);

    // Active voices get a quick fade-in; inactive voices stay at 0
    const activeGate = el.sm(el.const({ key: `bbd-active-${index}`, value: isActive ? 1.0 : 0.0 }));
    const aliveRamp = elMin(one, el.mul(age, safeNumVoices * 20));
    const alive = el.mul(aliveRamp, activeGate);

    // This voice's extent: its own anchor was set at birth
    const voiceExtentFixed = el.add(smoothSD, el.mul(age, cycleDurSec));
    const voiceExtent = el.add(
      el.mul(smoothFixed, voiceExtentFixed),
      el.mul(el.sub(1.0, smoothFixed), smoothSD)
    );

    const voiceFullRange = elMax(zero, el.sub(voiceExtent, smoothMinDel));
    const voiceSweepRange = el.add(
      el.mul(smoothFull, voiceFullRange),
      el.mul(el.sub(1.0, smoothFull), rateSweepRange)
    );

    const p = passPhaseBase;

    const fwdP = p;
    const bwdP = el.sub(1.0, p);
    // Sinusoidal boomerang: 0.5 - 0.5*cos(2πp)
    // Decelerates at far end, snaps back — elastic paddle-ball feel
    const boomP = el.mul(0.5, el.sub(1.0, el.cos(el.mul(2 * Math.PI, p))));
    const sweepPhase = el.add(
      el.mul(smoothDirFwd, fwdP),
      el.add(
        el.mul(smoothDirBwd, bwdP),
        el.mul(smoothDirBoom, boomP)
      )
    );

    const delaySec = el.sub(voiceExtent, el.mul(voiceSweepRange, sweepPhase));
    const delaySamples = el.mul(delaySec, sampleRate);
    const clamped = elMin(clampMax, elMax(clampMin, delaySamples));

    const head = el.delay(
      { size: maxBufferSamples },
      clamped,
      0,
      toBuffer
    );

    return el.mul(el.mul(head, alive), voiceGain) as NodeRepr_t;
  }

  const voices: NodeRepr_t[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    voices.push(voice(i));
  }
  const mixed = addMany(voices);

  // Cycle envelope for fixed mode: instant-on, fade out over last 10%
  const fadeOut = elMin(
    one,
    el.mul(el.sub(1.0, cyclePhase), 10.0)
  );
  const cycleEnv = el.add(
    el.mul(smoothFixed, fadeOut),
    el.sub(1.0, smoothFixed)
  );
  const enveloped = el.mul(mixed, cycleEnv) as NodeRepr_t;

  const mixedTapped = el.tapOut({ name: "bbd-gfb-tap" }, enveloped) as NodeRepr_t;

  const dry = el.mul(
    input,
    el.sm(el.const({ key: "bbd-dry", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wet = el.mul(
    mixedTapped,
    el.sm(el.const({ key: "bbd-wet", value: dryWet }))
  ) as NodeRepr_t;

  // Safety limiter on output to prevent speaker damage
  return el.tanh(el.add(dry, wet, fbSink)) as NodeRepr_t;
}
