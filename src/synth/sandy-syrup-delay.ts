import { el, type NodeRepr_t } from "@elemaudio/core";

export const MAX_VOICES = 12;

export interface SandySyrupDelayParams {
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
  grainSize: number;
  blend: number; // 0 = grit (S/H rate per grain), 1 = syrup (continuous rate)
}

const MAX_BUFFER_SECONDS = 30;

function addMany(ins: NodeRepr_t[]): NodeRepr_t {
  if (ins.length === 0) return el.const({ value: 0 }) as NodeRepr_t;
  if (ins.length === 1) return ins[0];
  if (ins.length <= 8) return el.add(...ins) as NodeRepr_t;
  return el.add(...ins.slice(0, 7), addMany(ins.slice(7))) as NodeRepr_t;
}

function elMax(a: NodeRepr_t, b: NodeRepr_t): NodeRepr_t {
  return el.mul(0.5, el.add(el.add(a, b), el.abs(el.sub(a, b)))) as NodeRepr_t;
}

export function sandySyrupDelayGraph(
  params: SandySyrupDelayParams,
  sampleRate: number
): NodeRepr_t {
  const { numVoices, speed, range, directionUp, tilt, feedback, fbDelay, globalFeedback, dryWet, inputGain, grainSize, blend } =
    params;

  const skew = Math.pow(2, tilt * 2);
  const maxBufferSamples = Math.ceil(MAX_BUFFER_SECONDS * sampleRate);
  const fbDelaySamples = Math.max(1, Math.round(fbDelay * sampleRate));

  const octaves = Math.max(0.1, range);
  const grainDurSamples = Math.max(64, Math.round(grainSize * sampleRate));

  const rawInput = el.in({ channel: 0 }) as NodeRepr_t;
  const input = el.mul(
    rawInput,
    el.sm(el.const({ key: "input-gain", value: inputGain }))
  ) as NodeRepr_t;

  const smoothFeedback = el.sm(
    el.const({ key: "ssd-feedback", value: feedback })
  );

  const smoothGlobalFb = el.sm(
    el.const({ key: "ssd-gfb", value: globalFeedback })
  );

  const fbSignal = el.tapIn({ name: "ssd-fb" }) as NodeRepr_t;
  const globalFbSignal = el.tapIn({ name: "ssd-gfb-tap" }) as NodeRepr_t;
  const toBuffer = el.add(
    input,
    el.mul(fbSignal, smoothFeedback),
    el.mul(globalFbSignal, smoothGlobalFb)
  ) as NodeRepr_t;

  const fbHead = el.delay(
    { size: maxBufferSamples },
    el.sm(el.const({ key: "ssd-fb-delay", value: fbDelaySamples })),
    0,
    toBuffer
  );
  const fbTapped = el.tapOut({ name: "ssd-fb" }, fbHead) as NodeRepr_t;
  const fbSink = el.mul(fbTapped, 0) as NodeRepr_t;

  const smoothSpeed = el.sm(
    el.const({ key: "ssd-speed", value: speed })
  );
  const smoothFbDelay = el.sm(
    el.const({ key: "ssd-fb-d-voice", value: fbDelaySamples })
  );
  const smoothOctaves = el.sm(
    el.const({ key: "ssd-oct", value: octaves })
  );
  const smoothGrainDur = el.sm(
    el.const({ key: "ssd-gdur", value: grainDurSamples })
  );
  const smoothBlend = el.sm(
    el.const({ key: "ssd-blend", value: blend })
  );
  const invBlend = el.sub(1.0, smoothBlend);

  const voiceGain = 2 / numVoices;

  const dirSign = el.sm(
    el.const({ key: "ssd-dir", value: directionUp ? 1.0 : -1.0 })
  );

  const sweepDuration = speed > 0 ? 1 / speed : 10;
  const grainsPerSweep = Math.max(1, sweepDuration / Math.max(0.005, grainSize));
  const smoothGPS = el.sm(el.const({ key: "ssd-gps", value: grainsPerSweep }));

  const normFactor = 1 / (Math.pow(2, octaves) - 1);
  const smoothNorm = el.sm(
    el.const({ key: "ssd-norm", value: normFactor })
  );

  function voice(index: number) {
    const phaseOffset = index / numVoices;

    const raw = el.phasor(smoothSpeed);
    const shifted = el.add(
      raw,
      el.const({ key: `ssd-ph-${index}`, value: phaseOffset })
    );
    const sweepPhasor = el.sub(shifted, el.floor(shifted));

    // Position curve: distributes grains from fbDelay (far) to 0 (near)
    const expRaw = el.sub(
      el.pow(2, el.mul(smoothOctaves, el.sub(1.0, sweepPhasor))),
      1.0
    );
    const basePosition = el.mul(el.mul(expRaw, smoothNorm), smoothFbDelay);

    // Rate curve: centered exponential
    // dirUp: 2^(-oct/2) at p=0 → 1.0 at p=0.5 → 2^(+oct/2) at p=1
    const rateExponent = el.mul(
      smoothOctaves,
      el.mul(el.sub(sweepPhasor, 0.5), dirSign)
    );
    const targetRate = el.pow(2, rateExponent);

    // Sweep Hann envelope
    const smoothSkew = el.sm(
      el.const({ key: "ssd-skew", value: skew })
    );
    const skewedSweep = el.pow(sweepPhasor, smoothSkew);
    const sweepHann = el.mul(
      0.5,
      el.sub(1.0, el.cos(el.mul(2 * Math.PI, skewedSweep)))
    );

    function grainStream(streamOffset: number, suffix: string) {
      const grainPhase = el.add(
        el.mul(sweepPhasor, smoothGPS),
        streamOffset
      );
      const grainIdx = el.floor(grainPhase);
      const trigger = el.sub(grainIdx, el.z(grainIdx));

      // S/H position and rate at grain boundary
      const heldDelay = el.latch(trigger, basePosition);
      const heldRate = el.latch(trigger, targetRate);

      const grainPhasor = el.sub(grainPhase, grainIdx);

      // Blend rate: grit uses S/H rate, syrup uses live rate
      const effectiveRate = el.add(
        el.mul(heldRate, invBlend),
        el.mul(targetRate, smoothBlend)
      );

      // Within-grain delay ramp
      const delayRamp = el.mul(
        el.mul(el.sub(1.0, effectiveRate), smoothGrainDur),
        grainPhasor
      );

      const rawDelay = el.add(heldDelay, delayRamp);
      const clampedDelay = elMax(rawDelay, el.const({ key: `ssd-zero-${index}${suffix}`, value: 1 }) as NodeRepr_t);

      const head = el.delay(
        { size: maxBufferSamples },
        clampedDelay,
        0,
        toBuffer
      );

      const hann = el.mul(
        0.5,
        el.sub(1.0, el.cos(el.mul(2 * Math.PI, grainPhasor)))
      );

      return el.mul(head, hann) as NodeRepr_t;
    }

    const streamA = grainStream(0, "a");
    const streamB = grainStream(0.5, "b");
    const grained = el.add(streamA, streamB) as NodeRepr_t;

    return el.mul(
      el.mul(grained, sweepHann),
      voiceGain
    ) as NodeRepr_t;
  }

  const voices: NodeRepr_t[] = [];
  for (let i = 0; i < numVoices; i++) {
    voices.push(voice(i));
  }
  const mixed = addMany(voices);
  const mixedTapped = el.tapOut({ name: "ssd-gfb-tap" }, mixed) as NodeRepr_t;

  const dry = el.mul(
    input,
    el.sm(el.const({ key: "ssd-dry", value: 1 - dryWet }))
  ) as NodeRepr_t;
  const wet = el.mul(
    mixedTapped,
    el.sm(el.const({ key: "ssd-wet", value: dryWet }))
  ) as NodeRepr_t;

  return el.add(dry, wet, fbSink) as NodeRepr_t;
}
