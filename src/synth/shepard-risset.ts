import { el, type NodeRepr_t } from "@elemaudio/core";

export interface ShepardParams {
  numVoices: number;
  speed: number;
  startFreq: number;
  intervalRatio: number;
  directionUp: boolean;
}

function phasedPhasor(key: string, speed: number, phaseOffset: number) {
  const smoothSpeed = el.sm(
    el.const({ key: "phased-phasor-speed", value: speed })
  );
  const t = el.add(
    el.phasor(smoothSpeed, 0),
    el.sm(el.const({ key: `${key}:offset`, value: phaseOffset }))
  );
  return el.sub(t, el.floor(t));
}

function phasedCycle(key: string, speed: number, phaseOffset: number) {
  const p = phasedPhasor(key, speed, phaseOffset);
  const offset = el.sub(
    el.mul(2 * Math.PI, p),
    el.const({ key: "phased-cycle-offset", value: 1.5 })
  );
  return el.mul(el.add(el.sin(offset), 1), 0.5);
}

function addMany(ins: NodeRepr_t[]): NodeRepr_t {
  if (ins.length < 9) {
    return el.add(...ins) as NodeRepr_t;
  }
  return el.add(...ins.slice(0, 7), addMany(ins.slice(8))) as NodeRepr_t;
}

export function shepardRissetGraph(params: ShepardParams): NodeRepr_t {
  const { numVoices, speed, startFreq, intervalRatio, directionUp } = params;

  const freqRange = el.sm(
    el.const({
      key: "freq-range",
      value: startFreq * intervalRatio * numVoices,
    })
  );
  const smoothStartFreq = el.sm(
    el.const({ key: "start-freq", value: startFreq })
  );

  function rampingSine(key: string, phaseOffset: number) {
    const modulatorUp = phasedPhasor(key, speed, phaseOffset);
    const modulatorDown = el.sub(1.0, modulatorUp);
    const modulator = directionUp ? modulatorUp : modulatorDown;
    return el.mul(
      el.cycle(
        el.add(el.mul(el.pow(modulator, 2), freqRange), smoothStartFreq)
      ),
      phasedCycle(key, speed, phaseOffset)
    );
  }

  const allVoices = Array.from({ length: numVoices }, (_, i) => {
    const voice = rampingSine(`voice-${i}`, (1 / numVoices) * i);
    return el.mul(
      voice,
      el.sm(el.const({ key: "scale-amp", value: 1 / numVoices }))
    );
  });

  return addMany(allVoices as NodeRepr_t[]);
}
