import { el, type NodeRepr_t } from "@elemaudio/core";

export interface ShepardDelayGlobalFeedbackParams {
  numVoices: number;
  speed: number;
  intervalRatio: number;
  directionUp: boolean;
  dryWet: number;
  feedback: number;
  inputGain: number;
}

const MAX_BUFFER_SECONDS = 30;

function phasedPhasor(key: string, speed: number, phaseOffset: number) {
  const smoothSpeed = el.sm(
    el.const({ key: "phased-phasor-speed", value: speed })
  );
  const t = el.add(
    el.phasor(smoothSpeed),
    el.sm(el.const({ key: `${key}:offset`, value: phaseOffset }))
  );
  return el.sub(t, el.floor(t));
}

function phasedEnvelope(key: string, speed: number, phaseOffset: number) {
  const p = phasedPhasor(key, speed, phaseOffset);
  const angle = el.sub(el.mul(2 * Math.PI, p), Math.PI);
  return el.mul(el.add(el.cos(angle), 1), 0.5);
}

function addMany(ins: NodeRepr_t[]): NodeRepr_t {
  if (ins.length < 9) {
    return el.add(...ins) as NodeRepr_t;
  }
  return el.add(...ins.slice(0, 7), addMany(ins.slice(8))) as NodeRepr_t;
}

export function shepardDelayGlobalFeedbackGraph(
  params: ShepardDelayGlobalFeedbackParams,
  sampleRate: number
): NodeRepr_t {
  const {
    numVoices,
    speed,
    intervalRatio,
    directionUp,
    dryWet,
    feedback,
    inputGain,
  } = params;

  const rawInput = el.in({ channel: 0 }) as NodeRepr_t;
  const input = el.mul(
    rawInput,
    el.sm(el.const({ key: "input-gain", value: inputGain }))
  ) as NodeRepr_t;

  const maxBufferSamples = Math.ceil(MAX_BUFFER_SECONDS * sampleRate);

  // The squared mapping delay = range * (1 - p²) makes the rate of delay
  // change proportional to the phasor value p. This means voices at different
  // phases produce different instantaneous pitch shifts — the Shepard spread.
  //
  // Pitch ratio at phasor value p:
  //   R(p) = 1 + 2·p · delayRange · speed / sampleRate     (upward)
  //   R(p) = 1 - 2·p · delayRange · speed / sampleRate     (downward)
  //
  // We want R(1) = intervalRatio (up) or 1/intervalRatio (down), so:
  //   delayRange = K · sampleRate / (2 · speed)
  // where K = intervalRatio - 1 (up) or 1 - 1/intervalRatio (down).
  const K = directionUp
    ? intervalRatio - 1
    : 1 - 1 / intervalRatio;

  const targetRange = Math.round((K * sampleRate) / (2 * speed));
  const delayRangeSamples = Math.min(targetRange, maxBufferSamples - 1);
  const smoothRange = el.sm(
    el.const({ key: "delay-range", value: delayRangeSamples })
  );

  // Global feedback loop
  const smoothFeedback = el.sm(
    el.const({ key: "global-feedback", value: feedback })
  );
  const fbSignal = el.tapIn({ name: "global-fb" }) as NodeRepr_t;
  const combinedInput = el.add(
    input,
    el.mul(fbSignal, smoothFeedback)
  ) as NodeRepr_t;

  const ampScale = el.sm(
    el.const({ key: "scale-amp", value: 1 / numVoices })
  );

  function grainVoice(key: string, phaseOffset: number) {
    const phasor = phasedPhasor(key, speed, phaseOffset);
    const phasorSq = el.mul(phasor, phasor);

    // Up: delay = range·(1 - p²) → starts at range, decreases → pitch rises
    // Down: delay = range·p²       → starts at 0, increases → pitch falls
    const delaySamples = directionUp
      ? el.mul(smoothRange, el.sub(1.0, phasorSq))
      : el.mul(smoothRange, phasorSq);

    const delayed = el.delay(
      { size: maxBufferSamples },
      delaySamples,
      0,
      combinedInput
    );

    const envelope = phasedEnvelope(key, speed, phaseOffset);

    const scaled = el.mul(delayed, ampScale);
    const enveloped = el.mul(scaled, envelope);
    return { raw: scaled as NodeRepr_t, shaped: enveloped as NodeRepr_t };
  }

  const rawVoices: NodeRepr_t[] = [];
  const shapedVoices: NodeRepr_t[] = [];

  for (let i = 0; i < numVoices; i++) {
    const { raw, shaped } = grainVoice(`voice-${i}`, i / numVoices);
    rawVoices.push(raw);
    shapedVoices.push(shaped);
  }

  // Raw sum (no envelope) feeds back through the global loop
  const rawSum = addMany(rawVoices);
  const wetWithTap = el.tapOut(
    { name: "global-fb" },
    rawSum
  ) as NodeRepr_t;

  // Enveloped sum is the audible wet signal
  const wetSignal = addMany(shapedVoices);

  const dry = el.mul(
    input,
    el.sm(el.const({ key: "dry-gain", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wet = el.mul(
    wetSignal,
    el.sm(el.const({ key: "wet-gain", value: dryWet }))
  ) as NodeRepr_t;

  // Keep tapOut in the rendered graph so the feedback loop executes
  const fbSink = el.mul(wetWithTap, 0) as NodeRepr_t;

  return el.add(dry, wet, fbSink) as NodeRepr_t;
}
