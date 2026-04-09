import { el, type NodeRepr_t } from "@elemaudio/core";

export type Direction = "forward" | "backward" | "boomerang";
export type AnchorMode = "fixed" | "tracking";

export interface BipolarBreakdownDelayParams {
  direction: Direction;
  anchorMode: AnchorMode;
  overlap: number;
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
const MAX_OVERLAP = 8;

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
    direction, anchorMode, overlap, fullSweep,
    speed, startDelay, minDelay, initRate, accel, maxPasses,
    feedback, fbDelay, globalFeedback, dryWet, inputGain, resetCount,
  } = params;

  const maxBufferSamples = Math.ceil(MAX_BUFFER_SECONDS * sampleRate);
  const fbDelaySamples = Math.max(1, Math.round(fbDelay * sampleRate));
  const safeSpeed = Math.max(0.001, speed);
  const safeMaxPasses = Math.max(1, Math.round(maxPasses));
  const safeOverlap = Math.max(1, Math.min(MAX_OVERLAP, Math.round(overlap)));

  const rawInput = el.in({ channel: 0 }) as NodeRepr_t;
  const input = el.mul(
    rawInput,
    el.sm(el.const({ key: "input-gain", value: inputGain }))
  ) as NodeRepr_t;

  const smoothFeedback = el.sm(el.const({ key: "bbd-feedback", value: feedback }));
  const smoothGlobalFb = el.sm(el.const({ key: "bbd-gfb", value: globalFeedback }));
  const fbSignal = el.tapIn({ name: "bbd-fb" }) as NodeRepr_t;
  const globalFbSignal = el.tapIn({ name: "bbd-gfb-tap" }) as NodeRepr_t;
  const toBuffer = el.add(
    input,
    el.mul(fbSignal, smoothFeedback),
    el.mul(globalFbSignal, smoothGlobalFb)
  ) as NodeRepr_t;

  const fbHead = el.delay(
    { size: maxBufferSamples },
    el.sm(el.const({ key: "bbd-fb-delay", value: fbDelaySamples })),
    0,
    toBuffer
  );
  const fbTapped = el.tapOut({ name: "bbd-fb" }, fbHead) as NodeRepr_t;
  const fbSink = el.mul(fbTapped, 0) as NodeRepr_t;

  // Elapsed time: 0 → MAX_BUFFER_SECONDS.
  // Keyed on resetCount so incrementing it spawns a fresh phasor at 0,
  // which resets the anchor position (x).
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

  // --- Rate (for rate-controlled mode) ---
  const smoothInitRate = el.sm(el.const({ key: "bbd-init-rate", value: initRate }));
  const smoothAccel = el.sm(el.const({ key: "bbd-accel", value: accel }));
  const currentRate = el.add(smoothInitRate, el.mul(passIndex, smoothAccel));

  // --- Extent (distance between anchor x and record head) ---
  const smoothSD = el.sm(el.const({ key: "bbd-sd", value: startDelay }));
  const smoothMinDel = el.sm(el.const({ key: "bbd-min-del-sec", value: minDelay }));
  const isFixedVal = anchorMode === "fixed" ? 1.0 : 0.0;
  const smoothFixed = el.sm(el.const({ key: "bbd-fixed", value: isFixedVal }));
  // Fixed: extent = startDelay + elapsed_in_cycle
  const extentFixed = el.add(smoothSD, el.mul(cyclePhase, safeMaxPasses / safeSpeed));
  // Tracking: extent = startDelay (constant)
  const extent = el.add(
    el.mul(smoothFixed, extentFixed),
    el.mul(el.sub(1.0, smoothFixed), smoothSD)
  );

  // --- Sweep range: from extent down to minDelay (not all the way to 0) ---
  const zero = el.const({ key: "bbd-zero", value: 0 }) as NodeRepr_t;
  const fullSweepRange = elMax(zero, el.sub(extent, smoothMinDel));
  const passDur = el.sm(el.const({ key: "bbd-pas-dur", value: 1 / safeSpeed }));
  const rateSweepRange = elMax(zero, el.mul(el.sub(currentRate, 1.0), passDur));
  const isFullVal = fullSweep ? 1.0 : 0.0;
  const smoothFull = el.sm(el.const({ key: "bbd-full-sweep", value: isFullVal }));
  const sweepRange = el.add(
    el.mul(smoothFull, fullSweepRange),
    el.mul(el.sub(1.0, smoothFull), rateSweepRange)
  );

  // --- Direction weights ---
  const isFwd = direction === "forward" ? 1.0 : 0.0;
  const isBwd = direction === "backward" ? 1.0 : 0.0;
  const isBoom = direction === "boomerang" ? 1.0 : 0.0;
  const smoothDirFwd = el.sm(el.const({ key: "dir-fwd", value: isFwd }));
  const smoothDirBwd = el.sm(el.const({ key: "dir-bwd", value: isBwd }));
  const smoothDirBoom = el.sm(el.const({ key: "dir-boom", value: isBoom }));

  const voiceGain = 2 / safeOverlap;
  const clampMin = el.const({ key: "bbd-clamp-min", value: 1 }) as NodeRepr_t;
  const clampMax = el.const({ key: "bbd-clamp-max", value: maxBufferSamples - 1 }) as NodeRepr_t;

  function voice(index: number): NodeRepr_t {
    const phaseOffset = index / safeOverlap;
    const rawPhase = el.add(
      passPhaseBase,
      el.const({ key: `bbd-ph-${index}`, value: phaseOffset })
    );
    const p = el.sub(rawPhase, el.floor(rawPhase));

    // Forward: p sweeps 0→1 (far→near)
    // Backward: 1−p (near→far)
    // Boomerang: 1−|1−2p| (far→near→far)
    const fwdP = p;
    const bwdP = el.sub(1.0, p);
    const boomP = el.sub(1.0, el.abs(el.sub(1.0, el.mul(2.0, p))));

    const sweepPhase = el.add(
      el.mul(smoothDirFwd, fwdP),
      el.add(
        el.mul(smoothDirBwd, bwdP),
        el.mul(smoothDirBoom, boomP)
      )
    );

    // delay = extent − sweepRange × sweepPhase
    // At sweepPhase=0: delay = extent (at anchor x)
    // At sweepPhase=1: delay = extent − sweepRange = minDelay (near record head)
    const delaySec = el.sub(extent, el.mul(sweepRange, sweepPhase));
    const delaySamples = el.mul(delaySec, sampleRate);
    const clamped = elMin(clampMax, elMax(clampMin, delaySamples));

    const head = el.delay(
      { size: maxBufferSamples },
      clamped,
      0,
      toBuffer
    );

    if (safeOverlap > 1) {
      const hann = el.mul(0.5, el.sub(1.0, el.cos(el.mul(2 * Math.PI, p))));
      return el.mul(head, hann, voiceGain) as NodeRepr_t;
    }
    return el.mul(head, voiceGain) as NodeRepr_t;
  }

  const voices: NodeRepr_t[] = [];
  for (let i = 0; i < safeOverlap; i++) {
    voices.push(voice(i));
  }
  const mixed = addMany(voices);

  // Cycle envelope for fixed mode: instant-on, fade out over last 10%
  // of the cycle before the anchor resets. Tracking mode: flat 1.0.
  const fadeOut = elMin(
    el.const({ key: "bbd-env-one", value: 1.0 }) as NodeRepr_t,
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

  return el.add(dry, wet, fbSink) as NodeRepr_t;
}
