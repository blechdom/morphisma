import { el, type NodeRepr_t } from "@elemaudio/core";

export const MAX_VOICES = 12;

export interface CandyCoilDelayParams {
  numVoices: number;
  speed: number;
  range: number;
  directionUp: boolean;
  tilt: number;
  feedback: number;
  fbDelay: number;
  globalFeedback: number;
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

export function candyCoilDelayGraph(
  params: CandyCoilDelayParams,
  sampleRate: number
): NodeRepr_t {
  const { numVoices, speed, range, directionUp, tilt, feedback, fbDelay, globalFeedback, dryWet, inputGain } =
    params;

  const skew = Math.pow(2, tilt * 2);

  const maxBufferSamples = Math.ceil(MAX_BUFFER_SECONDS * sampleRate);
  const rangeSamples = Math.max(
    1,
    Math.min(Math.round(range * sampleRate), maxBufferSamples - 1)
  );

  const fbDelaySamples = Math.max(1, Math.round(fbDelay * sampleRate));

  const rawInput = el.in({ channel: 0 }) as NodeRepr_t;
  const input = el.mul(
    rawInput,
    el.sm(el.const({ key: "input-gain", value: inputGain }))
  ) as NodeRepr_t;

  const smoothFeedback = el.sm(
    el.const({ key: "ccd-feedback", value: feedback })
  );

  const smoothGlobalFb = el.sm(
    el.const({ key: "ccd-gfb", value: globalFeedback })
  );

  const fbSignal = el.tapIn({ name: "ccd-fb" }) as NodeRepr_t;
  const globalFbSignal = el.tapIn({ name: "ccd-gfb-tap" }) as NodeRepr_t;
  const toBuffer = el.add(
    input,
    el.mul(fbSignal, smoothFeedback),
    el.mul(globalFbSignal, smoothGlobalFb)
  ) as NodeRepr_t;

  // Feedback playhead: trails the write head by fbDelay seconds.
  // Does NOT go to the speaker — only feeds back into the buffer input.
  const fbHead = el.delay(
    { size: maxBufferSamples },
    el.sm(el.const({ key: "ccd-fb-delay", value: fbDelaySamples })),
    0,
    toBuffer
  );
  const fbTapped = el.tapOut({ name: "ccd-fb" }, fbHead) as NodeRepr_t;
  const fbSink = el.mul(fbTapped, 0) as NodeRepr_t;

  // Shepard voices — these read from the buffer and go to speaker output
  const smoothSpeed = el.sm(
    el.const({ key: "ccd-speed", value: speed })
  );
  const smoothRange = el.sm(
    el.const({ key: "ccd-range", value: rangeSamples })
  );

  const voiceGain = 2 / numVoices;

  const dir = el.sm(
    el.const({ key: "ccd-dir", value: directionUp ? 1.0 : 0.0 })
  );
  const invDir = el.sub(1.0, dir);

  function voice(index: number) {
    const phaseOffset = index / numVoices;

    const raw = el.phasor(smoothSpeed);
    const shifted = el.add(
      raw,
      el.const({ key: `ccd-ph-${index}`, value: phaseOffset })
    );
    const phasor = el.sub(shifted, el.floor(shifted));

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

    const smoothSkew = el.sm(
      el.const({ key: "ccd-skew", value: skew })
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
  const mixedTapped = el.tapOut({ name: "ccd-gfb-tap" }, mixed) as NodeRepr_t;

  const dry = el.mul(
    input,
    el.sm(el.const({ key: "ccd-dry", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wet = el.mul(
    mixedTapped,
    el.sm(el.const({ key: "ccd-wet", value: dryWet }))
  ) as NodeRepr_t;

  return el.add(dry, wet, fbSink) as NodeRepr_t;
}
