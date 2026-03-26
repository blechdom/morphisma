import { el, type NodeRepr_t } from "@elemaudio/core";

export const MAX_VOICES = 12;

export interface ElasticTrainDelayParams {
  numVoices: number;
  speed: number;
  range: number;
  directionUp: boolean;
  tilt: number;
  feedback: number;
  fbDelay: number;
  dryWet: number;
  inputGain: number;
  grainSize: number;
}

const MAX_BUFFER_SECONDS = 30;

function addMany(ins: NodeRepr_t[]): NodeRepr_t {
  if (ins.length === 0) return el.const({ value: 0 }) as NodeRepr_t;
  if (ins.length === 1) return ins[0];
  if (ins.length <= 8) return el.add(...ins) as NodeRepr_t;
  return el.add(...ins.slice(0, 7), addMany(ins.slice(7))) as NodeRepr_t;
}

export function elasticTrainDelayGraph(
  params: ElasticTrainDelayParams,
  sampleRate: number
): NodeRepr_t {
  const { numVoices, speed, range, directionUp, tilt, feedback, fbDelay, dryWet, inputGain, grainSize } =
    params;

  const skew = Math.pow(2, tilt * 2);
  const maxBufferSamples = Math.ceil(MAX_BUFFER_SECONDS * sampleRate);
  const fbDelaySamples = Math.max(1, Math.round(fbDelay * sampleRate));

  const octaves = Math.max(0.1, range);
  const normFactor = 1 / (Math.pow(2, octaves) - 1);

  const rawInput = el.in({ channel: 0 }) as NodeRepr_t;
  const input = el.mul(
    rawInput,
    el.sm(el.const({ key: "input-gain", value: inputGain }))
  ) as NodeRepr_t;

  const smoothFeedback = el.sm(
    el.const({ key: "etd-feedback", value: feedback })
  );

  const fbSignal = el.tapIn({ name: "etd-fb" }) as NodeRepr_t;
  const toBuffer = el.add(
    input,
    el.mul(fbSignal, smoothFeedback)
  ) as NodeRepr_t;

  const fbHead = el.delay(
    { size: maxBufferSamples },
    el.sm(el.const({ key: "etd-fb-delay", value: fbDelaySamples })),
    0,
    toBuffer
  );
  const fbTapped = el.tapOut({ name: "etd-fb" }, fbHead) as NodeRepr_t;
  const fbSink = el.mul(fbTapped, 0) as NodeRepr_t;

  const smoothSpeed = el.sm(
    el.const({ key: "etd-speed", value: speed })
  );
  const smoothFbDelay = el.sm(
    el.const({ key: "etd-fb-d-voice", value: fbDelaySamples })
  );
  const smoothOctaves = el.sm(
    el.const({ key: "etd-oct", value: octaves })
  );
  const smoothNorm = el.sm(
    el.const({ key: "etd-norm", value: normFactor })
  );

  const voiceGain = 2 / numVoices;

  const dir = el.sm(
    el.const({ key: "etd-dir", value: directionUp ? 1.0 : 0.0 })
  );
  const invDir = el.sub(1.0, dir);

  // Grain subdivision: how many grains fit in one sweep
  const sweepDuration = speed > 0 ? 1 / speed : 10;
  const grainsPerSweep = Math.max(1, Math.round(sweepDuration / Math.max(0.005, grainSize)));

  function voice(index: number) {
    const phaseOffset = index / numVoices;

    const raw = el.phasor(smoothSpeed);
    const shifted = el.add(
      raw,
      el.const({ key: `etd-ph-${index}`, value: phaseOffset })
    );
    const sweepPhasor = el.sub(shifted, el.floor(shifted));

    // Exponential curve scaled by octave range, normalized to 0–1
    const expRaw = el.sub(
      el.pow(2, el.mul(smoothOctaves, el.sub(1.0, sweepPhasor))),
      1.0
    );
    const expCurve = el.mul(expRaw, smoothNorm);
    const curve = el.add(
      el.mul(dir, expCurve),
      el.mul(invDir, el.sub(1.0, expCurve))
    );

    // Delay sweeps from fbDelay toward 0 (write head)
    const delaySamples = el.mul(curve, smoothFbDelay);

    const head = el.delay(
      { size: maxBufferSamples },
      delaySamples,
      0,
      toBuffer
    );

    // SWEEP WINDOW: large Hann — fade in at fb head, fade out at write head
    const smoothSkew = el.sm(
      el.const({ key: "etd-skew", value: skew })
    );
    const skewedSweep = el.pow(sweepPhasor, smoothSkew);
    const sweepHann = el.mul(
      0.5,
      el.sub(1.0, el.cos(el.mul(2 * Math.PI, skewedSweep)))
    );

    // GRAIN WINDOW: smaller Hann cycling grainsPerSweep times per sweep
    const grainPhase = el.mul(
      sweepPhasor,
      el.const({ key: `etd-gps-${index}`, value: grainsPerSweep })
    );
    const grainPhasor = el.sub(grainPhase, el.floor(grainPhase));
    const grainHann = el.mul(
      0.5,
      el.sub(1.0, el.cos(el.mul(2 * Math.PI, grainPhasor)))
    );

    return el.mul(
      el.mul(el.mul(head, sweepHann), grainHann),
      voiceGain
    ) as NodeRepr_t;
  }

  const voices: NodeRepr_t[] = [];
  for (let i = 0; i < numVoices; i++) {
    voices.push(voice(i));
  }
  const mixed = addMany(voices);

  const dry = el.mul(
    input,
    el.sm(el.const({ key: "etd-dry", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wet = el.mul(
    mixed,
    el.sm(el.const({ key: "etd-wet", value: dryWet }))
  ) as NodeRepr_t;

  return el.add(dry, wet, fbSink) as NodeRepr_t;
}
