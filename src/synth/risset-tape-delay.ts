import { el, type NodeRepr_t } from "@elemaudio/core";

export const MAX_VOICES = 12;

export interface RissetTapeDelayParams {
  numVoices: number;
  speed: number;
  range: number;
  directionUp: boolean;
  tilt: number;
  feedback: number;
  dryWet: number;
  inputGain: number;
}

const MAX_BUFFER_SECONDS = 30;

function addMany(ins: NodeRepr_t[]): NodeRepr_t {
  if (ins.length === 0) return el.const({ value: 0 }) as NodeRepr_t;
  if (ins.length === 1) return ins[0];
  if (ins.length <= 8) return el.add(...ins) as NodeRepr_t;
  return el.add(...ins.slice(0, 7), addMany(ins.slice(7))) as NodeRepr_t;
}

export function rissetTapeDelayGraph(
  params: RissetTapeDelayParams,
  sampleRate: number
): NodeRepr_t {
  const { numVoices, speed, range, directionUp, tilt, feedback, dryWet, inputGain } =
    params;

  // tilt ∈ [-1, +1] → skew = 2^(tilt×2)
  // skew < 1: window peaks early in the sweep (less chipmunk)
  // skew = 1: symmetric Hann (normal)
  // skew > 1: window peaks late in the sweep
  const skew = Math.pow(2, tilt * 2);

  const maxBufferSamples = Math.ceil(MAX_BUFFER_SECONDS * sampleRate);
  const rangeSamples = Math.max(
    1,
    Math.min(Math.round(range * sampleRate), maxBufferSamples - 1)
  );

  const rawInput = el.in({ channel: 0 }) as NodeRepr_t;
  const input = el.mul(
    rawInput,
    el.sm(el.const({ key: "input-gain", value: inputGain }))
  ) as NodeRepr_t;

  const smoothFeedback = el.sm(
    el.const({ key: "rtd-feedback", value: feedback })
  );
  const fbSignal = el.tapIn({ name: "rtd-fb" }) as NodeRepr_t;
  const toBuffer = el.add(
    input,
    el.mul(fbSignal, smoothFeedback)
  ) as NodeRepr_t;

  const smoothSpeed = el.sm(
    el.const({ key: "rtd-speed", value: speed })
  );
  const smoothRange = el.sm(
    el.const({ key: "rtd-range", value: rangeSamples })
  );

  // N equidistant Hann windows sum to a constant N/2, so scale by 2/N.
  const voiceGain = 2 / numVoices;

  // Direction as a smooth signal so the graph topology stays constant.
  // dir=1 → up curve (delay shrinks → pitch rises)
  // dir=0 → down curve (delay grows → pitch falls)
  const dir = el.sm(
    el.const({ key: "rtd-dir", value: directionUp ? 1.0 : 0.0 })
  );
  const invDir = el.sub(1.0, dir);

  function voice(index: number) {
    const phaseOffset = index / numVoices;

    // Phasor with phase offset, wrapped to [0, 1)
    const raw = el.phasor(smoothSpeed);
    const shifted = el.add(
      raw,
      el.const({ key: `rtd-ph-${index}`, value: phaseOffset })
    );
    const phasor = el.sub(shifted, el.floor(shifted));

    // Exponential curve (the "wavetable"): 2^(1−p) − 1  maps 0→1
    // with steep start, gentle end — always computed the same way.
    //   up:   delay = expCurve × range        (high → low → pitch rises)
    //   down: delay = (1 − expCurve) × range  (low → high → pitch falls)
    // Blend with the smoothed dir signal so toggling never rebuilds nodes.
    const expCurve = el.sub(el.pow(2, el.sub(1.0, phasor)), 1.0);
    const curve = el.add(
      el.mul(dir, expCurve),
      el.mul(invDir, el.sub(1.0, expCurve))
    );
    const delaySamples = el.mul(curve, smoothRange);

    const head = el.delay(
      { size: maxBufferSamples },
      delaySamples,
      0,
      toBuffer
    );

    // Hann window with tilt: pow(phasor, skew) shifts where the peak lands.
    // skew < 1 → peaks early (fades out before extreme pitch)
    // skew > 1 → peaks late  (fades in after the start)
    const smoothSkew = el.sm(
      el.const({ key: "rtd-skew", value: skew })
    );
    const skewedPhasor = el.pow(phasor, smoothSkew);
    const hann = el.mul(
      0.5,
      el.sub(1.0, el.cos(el.mul(2 * Math.PI, skewedPhasor)))
    );

    return el.mul(el.mul(head, hann), voiceGain) as NodeRepr_t;
  }

  const voices: NodeRepr_t[] = [];
  for (let i = 0; i < numVoices; i++) {
    voices.push(voice(i));
  }
  const mixed = addMany(voices);

  const mixedTapped = el.tapOut({ name: "rtd-fb" }, mixed) as NodeRepr_t;

  const dry = el.mul(
    input,
    el.sm(el.const({ key: "rtd-dry", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wet = el.mul(
    mixed,
    el.sm(el.const({ key: "rtd-wet", value: dryWet }))
  ) as NodeRepr_t;

  const fbSink = el.mul(mixedTapped, 0) as NodeRepr_t;

  return el.add(dry, wet, fbSink) as NodeRepr_t;
}
