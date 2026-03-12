import { el, type NodeRepr_t } from "@elemaudio/core";

export interface ShepardDelayGlobalFeedbackParams {
  numVoices: number;
  speed: number;
  intervalRatio: number;
  directionUp: boolean;
  dryWet: number;
  feedback: number;
  inputGain: number;
  stereoSpread: number;
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
): [NodeRepr_t, NodeRepr_t] {
  const {
    numVoices,
    speed,
    intervalRatio,
    directionUp,
    dryWet,
    feedback,
    inputGain,
    stereoSpread,
  } = params;

  const rawInputs: [NodeRepr_t, NodeRepr_t] = [
    el.in({ channel: 0 }) as NodeRepr_t,
    el.in({ channel: 1 }) as NodeRepr_t,
  ];
  const smoothInputGain = el.sm(el.const({ key: "input-gain", value: inputGain }));

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

  const ampScale = el.sm(
    el.const({ key: "scale-amp", value: 1 / numVoices })
  );

  function grainVoice(key: string, phaseOffset: number, channelInput: NodeRepr_t) {
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
      channelInput
    );

    const envelope = phasedEnvelope(key, speed, phaseOffset);

    const scaled = el.mul(delayed, ampScale);
    const enveloped = el.mul(scaled, envelope);
    return { raw: scaled as NodeRepr_t, shaped: enveloped as NodeRepr_t };
  }

  const inputL = el.mul(rawInputs[0], smoothInputGain) as NodeRepr_t;
  const inputR = el.mul(rawInputs[1], smoothInputGain) as NodeRepr_t;

  const fbSignalL = el.tapIn({ name: "global-fb-0" }) as NodeRepr_t;
  const fbSignalR = el.tapIn({ name: "global-fb-1" }) as NodeRepr_t;

  const combinedInputL = el.add(
    inputL,
    el.mul(fbSignalL, smoothFeedback)
  ) as NodeRepr_t;
  const combinedInputR = el.add(
    inputR,
    el.mul(fbSignalR, smoothFeedback)
  ) as NodeRepr_t;

  const rawVoicesL: NodeRepr_t[] = [];
  const rawVoicesR: NodeRepr_t[] = [];
  const shapedVoicesL: NodeRepr_t[] = [];
  const shapedVoicesR: NodeRepr_t[] = [];
  const pannedVoicesL: NodeRepr_t[] = [];
  const pannedVoicesR: NodeRepr_t[] = [];

  for (let i = 0; i < numVoices; i++) {
    const phaseOffset = i / numVoices;
    const leftVoice = grainVoice(`ch0:voice-${i}`, phaseOffset, combinedInputL);
    const rightVoice = grainVoice(`ch1:voice-${i}`, phaseOffset, combinedInputR);

    rawVoicesL.push(leftVoice.raw);
    rawVoicesR.push(rightVoice.raw);
    shapedVoicesL.push(leftVoice.shaped);
    shapedVoicesR.push(rightVoice.shaped);

    const monoVoice = el.mul(el.add(leftVoice.shaped, rightVoice.shaped), 0.5) as NodeRepr_t;
    const pan = numVoices > 1 ? (i / (numVoices - 1)) * 2 - 1 : 0;
    const panLeft = Math.sqrt((1 - pan) * 0.5);
    const panRight = Math.sqrt((1 + pan) * 0.5);
    pannedVoicesL.push(el.mul(monoVoice, panLeft) as NodeRepr_t);
    pannedVoicesR.push(el.mul(monoVoice, panRight) as NodeRepr_t);
  }

  const rawSumL = addMany(rawVoicesL);
  const rawSumR = addMany(rawVoicesR);
  const wetWithTapL = el.tapOut({ name: "global-fb-0" }, rawSumL) as NodeRepr_t;
  const wetWithTapR = el.tapOut({ name: "global-fb-1" }, rawSumR) as NodeRepr_t;

  const wetDefaultL = addMany(shapedVoicesL);
  const wetDefaultR = addMany(shapedVoicesR);
  const wetPannedL = addMany(pannedVoicesL);
  const wetPannedR = addMany(pannedVoicesR);

  const spread = el.sm(el.const({ key: "stereo-spread", value: stereoSpread }));
  const wetBlendLinearL = el.add(
    el.mul(wetDefaultL, el.sub(1, spread)),
    el.mul(wetPannedL, spread)
  ) as NodeRepr_t;
  const wetBlendLinearR = el.add(
    el.mul(wetDefaultR, el.sub(1, spread)),
    el.mul(wetPannedR, spread)
  ) as NodeRepr_t;
  const spreadAtZero = el.le(spread, 0.0001);
  const spreadAtOne = el.ge(spread, 0.9999);
  const wetBlendL = el.select(
    spreadAtZero,
    wetDefaultL,
    el.select(spreadAtOne, wetPannedL, wetBlendLinearL)
  ) as NodeRepr_t;
  const wetBlendR = el.select(
    spreadAtZero,
    wetDefaultR,
    el.select(spreadAtOne, wetPannedR, wetBlendLinearR)
  ) as NodeRepr_t;

  const dryL = el.mul(
    inputL,
    el.sm(el.const({ key: "dry-gain:0", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const dryR = el.mul(
    inputR,
    el.sm(el.const({ key: "dry-gain:1", value: 1 - dryWet }))
  ) as NodeRepr_t;

  const wetL = el.mul(
    wetBlendL,
    el.sm(el.const({ key: "wet-gain:0", value: dryWet }))
  ) as NodeRepr_t;
  const wetR = el.mul(
    wetBlendR,
    el.sm(el.const({ key: "wet-gain:1", value: dryWet }))
  ) as NodeRepr_t;

  // Keep tapOut in the rendered graph so both feedback loops execute.
  const fbSinkL = el.mul(wetWithTapL, 0) as NodeRepr_t;
  const fbSinkR = el.mul(wetWithTapR, 0) as NodeRepr_t;

  return [
    el.add(dryL, wetL, fbSinkL) as NodeRepr_t,
    el.add(dryR, wetR, fbSinkR) as NodeRepr_t,
  ];
}
