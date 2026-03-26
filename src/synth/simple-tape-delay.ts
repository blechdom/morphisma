import { el, type NodeRepr_t } from "@elemaudio/core";

export interface SimpleTapeDelayParams {
  delayTime: number;
  feedback: number;
  dryWet: number;
  inputGain: number;
}

const MAX_BUFFER_SECONDS = 10;

export function simpleTapeDelayGraph(
  params: SimpleTapeDelayParams,
  sampleRate: number
): NodeRepr_t {
  const { delayTime, feedback, dryWet, inputGain } = params;

  const maxBufferSamples = Math.ceil(MAX_BUFFER_SECONDS * sampleRate);
  const delaySamples = Math.max(
    1,
    Math.min(Math.round(delayTime * sampleRate), maxBufferSamples - 1)
  );

  const rawInput = el.in({ channel: 0 }) as NodeRepr_t;
  const input = el.mul(
    rawInput,
    el.sm(el.const({ key: "input-gain", value: inputGain }))
  ) as NodeRepr_t;

  //  ┌──────────────────────────────────────────────────────┐
  //  │                 read output × feedback               │
  //  │                                                      │
  //  input ──►(+)──► [circular buffer write] ··· [read] ──► │ ──►(+)──► output
  //            ▲      (writes at current       (reads at     │     ▲
  //            │       index, advances          index -      │     │
  //            │       each sample)             delaySamples)│   input × (1 - dryWet)
  //            │                                      │      │
  //            └──────────────────────────────────────┘      │
  //                        feedback path                     │

  const smoothFeedback = el.sm(
    el.const({ key: "std-feedback", value: feedback })
  );
  const fbSignal = el.tapIn({ name: "std-fb" }) as NodeRepr_t;
  const toBuffer = el.add(
    input,
    el.mul(fbSignal, smoothFeedback)
  ) as NodeRepr_t;

  const smoothDelay = el.sm(
    el.const({ key: "std-delay", value: delaySamples })
  );
  const readHead = el.delay(
    { size: maxBufferSamples },
    smoothDelay,
    0,
    toBuffer
  );

  const readTapped = el.tapOut({ name: "std-fb" }, readHead) as NodeRepr_t;
  const fbSink = el.mul(readTapped, 0) as NodeRepr_t;

  const dry = el.mul(
    input,
    el.sm(el.const({ key: "std-dry", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wet = el.mul(
    readHead as NodeRepr_t,
    el.sm(el.const({ key: "std-wet", value: dryWet }))
  ) as NodeRepr_t;

  return el.add(dry, wet, fbSink) as NodeRepr_t;
}
