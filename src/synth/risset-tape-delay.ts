import { el, type NodeRepr_t } from "@elemaudio/core";

export interface RissetTapeDelayParams {
  speed: number;
  range: number;
  directionUp: boolean;
  feedback: number;
  dryWet: number;
  inputGain: number;
}

const MAX_BUFFER_SECONDS = 30;

export function rissetTapeDelayGraph(
  params: RissetTapeDelayParams,
  sampleRate: number
): NodeRepr_t {
  const { speed, range, directionUp, feedback, dryWet, inputGain } = params;

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

  // Feedback: play head output feeds back to record head input
  const smoothFeedback = el.sm(
    el.const({ key: "rtd-feedback", value: feedback })
  );
  const fbSignal = el.tapIn({ name: "rtd-fb" }) as NodeRepr_t;
  const toBuffer = el.add(
    input,
    el.mul(fbSignal, smoothFeedback)
  ) as NodeRepr_t;

  // Phasor ramps 0→1 at `speed` Hz — this drives the play head position.
  const smoothSpeed = el.sm(
    el.const({ key: "rtd-speed", value: speed })
  );
  const phasor = el.phasor(smoothSpeed, 0);

  // Up:   delay = (1 − phasor) × range  →  shrinks toward 0  →  pitch rises
  // Down: delay = phasor × range         →  grows toward max  →  pitch falls
  const modulator = directionUp
    ? el.sub(1.0, phasor)
    : phasor;

  const smoothRange = el.sm(
    el.const({ key: "rtd-range", value: rangeSamples })
  );
  const delaySamples = el.mul(modulator, smoothRange);

  const playHead = el.delay(
    { size: maxBufferSamples },
    delaySamples,
    0,
    toBuffer
  ) as NodeRepr_t;

  // Route play head output back through the feedback tap
  const playHeadTapped = el.tapOut(
    { name: "rtd-fb" },
    playHead
  ) as NodeRepr_t;

  // Dry / wet mix
  const dry = el.mul(
    input,
    el.sm(el.const({ key: "rtd-dry", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wet = el.mul(
    playHead,
    el.sm(el.const({ key: "rtd-wet", value: dryWet }))
  ) as NodeRepr_t;

  // Keep tapOut in graph so the feedback loop stays alive
  const fbSink = el.mul(playHeadTapped, 0) as NodeRepr_t;

  return el.add(dry, wet, fbSink) as NodeRepr_t;
}
