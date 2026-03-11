import { el, type NodeRepr_t } from "@elemaudio/core";

export interface ShepardDelayParams {
  numVoices: number;
  speed: number;
  maxDelayMs: number;
  intervalRatio: number;
  directionUp: boolean;
  dryWet: number;
  feedback: number;
  inputGain: number;
}

const MAX_BUFFER_SECONDS = 4;
const MIN_SAFE_DELAY_MS = 5;

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

function phasedCycle(
  key: string,
  speed: number,
  phaseOffset: number,
  envelopeExponent: number
) {
  const p = phasedPhasor(key, speed, phaseOffset);
  const offset = el.sub(
    el.mul(2 * Math.PI, p),
    el.const({ key: "phased-cycle-offset", value: 1.5 })
  );
  const rawEnvelope = el.mul(el.add(el.sin(offset), 1), 0.5);

  return el.pow(
    rawEnvelope,
    el.sm(el.const({ key: "env-exponent", value: envelopeExponent }))
  );
}

function addMany(ins: NodeRepr_t[]): NodeRepr_t {
  if (ins.length < 9) {
    return el.add(...ins) as NodeRepr_t;
  }
  return el.add(...ins.slice(0, 7), addMany(ins.slice(8))) as NodeRepr_t;
}

export function shepardDelayGraph(
  params: ShepardDelayParams,
  sampleRate: number
): NodeRepr_t {
  const {
    numVoices,
    speed,
    maxDelayMs,
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

  const maxDelaySamp = (maxDelayMs * sampleRate) / 1000;
  const computedMinMs = maxDelayMs / (intervalRatio * numVoices);
  const safeMinMs = Math.max(computedMinMs, MIN_SAFE_DELAY_MS);
  const minDelaySamp = (safeMinMs * sampleRate) / 1000;
  const delayRangeSamp = maxDelaySamp - minDelaySamp;

  const smoothMaxDelay = el.sm(
    el.const({ key: "max-delay-samp", value: maxDelaySamp })
  );
  const smoothDelayRange = el.sm(
    el.const({ key: "delay-range-samp", value: delayRangeSamp })
  );
  const smoothFeedback = el.sm(
    el.const({ key: "delay-feedback", value: feedback })
  );

  const envelopeExponent = 3 * Math.pow(1 - feedback, 1.5) + 0.05;

  function rampingDelay(key: string, phaseOffset: number) {
    const modulatorUp = phasedPhasor(key, speed, phaseOffset);
    const modulatorDown = el.sub(1.0, modulatorUp);
    const modulator = directionUp ? modulatorUp : modulatorDown;

    const delaySamples = el.sub(
      smoothMaxDelay,
      el.mul(el.pow(modulator, 2), smoothDelayRange)
    );

    const delayed = el.delay(
      { size: maxBufferSamples },
      delaySamples,
      smoothFeedback,
      input
    );
    const envelope = phasedCycle(key, speed, phaseOffset, envelopeExponent);
    return el.mul(delayed, envelope);
  }

  const allVoices = Array.from({ length: numVoices }, (_, i) => {
    const voice = rampingDelay(`voice-${i}`, (1 / numVoices) * i);
    return el.mul(
      voice,
      el.sm(el.const({ key: "scale-amp", value: 1 / numVoices }))
    );
  });

  const wetSignal = addMany(allVoices as NodeRepr_t[]);

  const dry = el.mul(
    input,
    el.sm(el.const({ key: "dry-gain", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wet = el.mul(
    wetSignal,
    el.sm(el.const({ key: "wet-gain", value: dryWet }))
  ) as NodeRepr_t;

  return el.add(dry, wet) as NodeRepr_t;
}
