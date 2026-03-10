# Morphisma — Audio Signal Flow Charts

---

## 1. Shepard-Risset Glissando (`/glissando`)

Pure synthesis — no external audio input.

```
                        ┌─────────────────────────────────────────────────────────────┐
                        │                    PER VOICE (× numVoices)                  │
                        │                                                             │
                        │   ┌──────────┐    ┌────────────┐                            │
                        │   │ el.const │───▶│   el.sm    │──── speed ──┐              │
                        │   │ (speed)  │    │ (smoothed) │             │              │
                        │   └──────────┘    └────────────┘             ▼              │
                        │                                        ┌──────────┐         │
                        │   ┌──────────┐    ┌────────────┐       │el.phasor │         │
                        │   │ el.const │───▶│   el.sm    │──┐    │ (speed)  │         │
                        │   │ (offset) │    │ (smoothed) │  │    └────┬─────┘         │
                        │   └──────────┘    └────────────┘  │         │               │
                        │                                   │    el.add               │
                        │                                   └────▶ + ◀────────────────│
                        │                                         │                   │
                        │                                    wrap (sub floor)          │
                        │                                         │                   │
                        │                                         ▼                   │
                        │                                   phasedPhasor              │
                        │                                     (0 → 1)                 │
                        │                                    ╱        ╲               │
                        │                  ┌────────────────╱          ╲───────┐      │
                        │                  ▼                                   ▼      │
                        │           ┌─────────────┐                   ┌────────────┐  │
                        │           │  MODULATOR   │                   │phasedCycle │  │
                        │           │  up: phasor  │                   │ (envelope) │  │
                        │           │ down: 1 - p  │                   │            │  │
                        │           └──────┬──────┘                   │ sin-based  │  │
                        │                  │                           │ cos window │  │
                        │                  ▼                           │ (0 → 1)   │  │
                        │           ┌─────────────┐                   └─────┬──────┘  │
                        │           │  el.pow(m,2) │                        │         │
                        │           │  (quadratic) │                        │         │
                        │           └──────┬──────┘                        │         │
                        │                  │                                │         │
                        │                  ▼                                │         │
                        │     ┌───────────────────────┐                    │         │
                        │     │ freq = m² × range     │                    │         │
                        │     │        + startFreq    │                    │         │
                        │     └───────────┬───────────┘                    │         │
                        │                 │                                 │         │
                        │                 ▼                                 │         │
                        │          ┌─────────────┐                         │         │
                        │          │  el.cycle    │                         │         │
                        │          │  (sine osc)  │                         │         │
                        │          └──────┬──────┘                         │         │
                        │                 │                                 │         │
                        │                 ▼                                 │         │
                        │              el.mul ◀────────────────────────────┘         │
                        │            osc × env                                       │
                        │                 │                                           │
                        │                 ▼                                           │
                        │           ┌───────────┐                                    │
                        │           │  × 1/N    │  (amplitude scale)                 │
                        │           └─────┬─────┘                                    │
                        │                 │                                           │
                        └─────────────────┼───────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┐│┌──────────────────────┐
                    │  voice 0            │││  voice 1 … voice N-1 │
                    └─────────┬───────────┘│└──────────┬───────────┘
                              │            │           │
                              ▼            ▼           ▼
                         ┌──────────────────────────────────┐
                         │         addMany (sum all)        │
                         └────────────────┬─────────────────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │   × gain    │  (main gain slider)
                                   │   el.mul    │
                                   └──────┬──────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │  el.scope   │ ──────▶ Oscilloscope UI
                                   └──────┬──────┘
                                          │
                                          ▼
                                ┌───────────────────┐
                                │  engine.render()  │
                                │  (L + R stereo)   │
                                └────────┬──────────┘
                                         │
                                         ▼
                                ┌───────────────────┐
                                │ AudioContext.dest  │
                                │    (speakers)     │
                                └───────────────────┘
```

---

## 2. Shepard Delay (`/shepard-delay`)

Effect processor — mic or audio file input.

```
  ┌──────────────┐      ┌────────────────────┐
  │  Microphone   │      │  Audio File (<audio>)│
  │ getUserMedia  │      │ createMediaElement  │
  └──────┬───────┘      └─────────┬──────────┘
         │                        │
         └───────────┬────────────┘
                     │
                     ▼
          ┌──────────────────┐
          │   Web Audio API  │
          │  source.connect  │
          │  (elemNode input)│
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │  el.in(ch: 0)    │  (Element Audio input)
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │  × inputGain     │
          │  el.mul          │
          └────────┬─────────┘
                   │
              input signal
                   │
         ┌─────────┴─────────────────────────────────────┐
         │                                               │
         ▼                                               ▼
  ┌─────────────┐               ┌────────────────────────────────────────────────────┐
  │  DRY PATH   │               │              PER VOICE (× numVoices)               │
  │             │               │                                                    │
  │  × (1-wet)  │               │   phasedPhasor(speed, i/N)                         │
  │             │               │          │                                         │
  └──────┬──────┘               │     ┌────┴────┐                                    │
         │                      │     ▼         ▼                                    │
         │                      │ MODULATOR   phasedCycle                             │
         │                      │ up: phasor  (sin envelope                           │
         │                      │ dn: 1 - p   w/ exponent                            │
         │                      │     │        shaped by                              │
         │                      │     ▼        feedback)                              │
         │                      │ ┌───────────────┐    │                              │
         │                      │ │ delaySamples  │    │                              │
         │                      │ │= max - m²×rng │    │                              │
         │                      │ └───────┬───────┘    │                              │
         │                      │         │            │                              │
         │                      │         ▼            │                              │
         │                      │ ┌───────────────┐    │                              │
         │                      │ │   el.delay    │    │                              │
         │                      │ │  size: 4s buf │    │                              │
         │                      │ │  delay: sweep │◀── input signal                   │
         │                      │ │  fb: feedback │    │                              │
         │                      │ └───────┬───────┘    │                              │
         │                      │         │            │                              │
         │                      │         ▼            │                              │
         │                      │      el.mul ◀────────┘                              │
         │                      │    delayed × env                                    │
         │                      │         │                                           │
         │                      │         ▼                                           │
         │                      │     × 1/N (scale)                                   │
         │                      │         │                                           │
         │                      └─────────┼───────────────────────────────────────────┘
         │                                │
         │                  ┌─────────────┼─────────────┐
         │                  │ voice 0 … voice N-1       │
         │                  └─────────────┬─────────────┘
         │                                │
         │                                ▼
         │                    ┌──────────────────────┐
         │                    │  addMany (sum voices) │
         │                    └──────────┬───────────┘
         │                               │
         │                               ▼
         │                       ┌──────────────┐
         │                       │   × dryWet   │  (wet gain)
         │                       │   WET PATH   │
         │                       └───────┬──────┘
         │                               │
         ▼                               ▼
      ┌──────────────────────────────────────┐
      │        el.add (dry + wet)            │
      └──────────────────┬───────────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │ × outputVol │  (output volume slider)
                  └──────┬──────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  el.scope   │ ──────▶ Oscilloscope UI
                  └──────┬──────┘
                         │
                         ▼
               ┌───────────────────┐
               │  engine.render()  │
               │  (L + R stereo)   │
               └────────┬──────────┘
                        │
                        ▼
               ┌───────────────────┐
               │ AudioContext.dest  │
               │    (speakers)     │
               └───────────────────┘
```

### Delay voice detail — per-voice feedback

Each voice has its **own internal feedback loop** via `el.delay`'s built-in feedback parameter.
The delay time sweeps continuously (quadratic ramp), creating the Shepard illusion of
endlessly rising/falling delay:

```
              maxDelay ─┐
                        │  quadratic sweep
   delay time (samples) │    ╲
                        │     ╲
                        │      ╲___________
              minDelay ─┘
                        0 ──── phasor ────▶ 1
                             (one cycle)
```

---

## 3. Shepard Delay — Global Feedback (`/shepard-delay-global-feedback`)

Effect processor with a **global feedback loop** (all voices feed back together).

```
  ┌──────────────┐      ┌────────────────────┐
  │  Microphone   │      │  Audio File (<audio>)│
  │ getUserMedia  │      │ createMediaElement  │
  └──────┬───────┘      └─────────┬──────────┘
         │                        │
         └───────────┬────────────┘
                     │
                     ▼
          ┌──────────────────┐
          │   Web Audio API  │
          │  source.connect  │
          │  (elemNode input)│
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │  el.in(ch: 0)    │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │  × inputGain     │
          └────────┬─────────┘
                   │
              input signal
                   │
                   ▼
   ┌───────────────────────────────────────┐
   │          GLOBAL FEEDBACK MIX          │
   │                                       │
   │   input ──────▶ el.add ◀──── el.mul   │
   │                   │          ▲        │
   │                   │          │        │
   │                   │     × feedback    │
   │                   │          │        │
   │                   │    ┌─────┴──────┐ │
   │                   │    │ el.tapIn   │ │
   │                   │    │("global-fb")│ │
   │                   │    └────────────┘ │
   │                   │         ▲         │
   └───────────────────┼─────────┼─────────┘
                       │         │
                  combinedInput  │ (feedback from rawSum below)
                       │         │
         ┌─────────────┴─────────┼──────────────────────────────────┐
         │                       │                                  │
         ▼                       │                                  │
  ┌─────────────┐                │                                  │
  │  DRY PATH   │                │                                  │
  │  × (1-wet)  │                │                                  │
  └──────┬──────┘                │                                  │
         │                       │                                  │
         │    ┌──────────────────┼──────────────────────────────────────────────┐
         │    │                  │      PER VOICE (× numVoices)                │
         │    │                  │                                              │
         │    │    phasedPhasor(speed, i/N)                                     │
         │    │           │                                                    │
         │    │      ┌────┴────┐                                               │
         │    │      ▼         ▼                                               │
         │    │  MODULATOR   phasedEnvelope                                     │
         │    │  up: 1 - p   (cosine window)                                    │
         │    │  dn: p                                                         │
         │    │      │            │                                             │
         │    │      ▼            │                                             │
         │    │ ┌────────────┐   │                                             │
         │    │ │delaySamples│   │                                             │
         │    │ │= mod × grn │   │                                             │
         │    │ └─────┬──────┘   │                                             │
         │    │       │          │                                              │
         │    │       ▼          │                                              │
         │    │ ┌────────────┐   │                                             │
         │    │ │  el.delay   │   │                                             │
         │    │ │ size: 30s  │   │                                             │
         │    │ │ delay: swp │◀── combinedInput                                │
         │    │ │ fb: 0      │   │                                             │
         │    │ │ (no local) │   │                                             │
         │    │ └─────┬──────┘   │                                             │
         │    │       │          │                                              │
         │    │       ▼          │                                              │
         │    │   × 1/N (scale) │                                              │
         │    │       │          │                                              │
         │    │    ┌──┴──┐       │                                              │
         │    │    │     │       │                                              │
         │    │    ▼     ▼       │                                              │
         │    │  RAW   SHAPED   │                                              │
         │    │  (no    (× env) │                                              │
         │    │   env)          │                                              │
         │    │    │      │     │                                               │
         │    └────┼──────┼─────┘                                              │
         │         │      │                                                    │
         │         ▼      ▼                                                    │
         │    ┌────────┐ ┌────────┐                                            │
         │    │addMany │ │addMany │                                            │
         │    │rawVoice│ │shaped  │                                            │
         │    └───┬────┘ └───┬────┘                                            │
         │        │          │                                                 │
         │        ▼          │                                                 │
         │  ┌────────────┐   │                                                 │
         │  │ el.tapOut   │   │                                                 │
         │  │("global-fb")│───┼──────────────────▶ feeds back to tapIn above   │
         │  └─────┬──────┘   │                                                 │
         │        │          │                                                 │
         │        ▼          │                                                 │
         │   × 0 (silent)   │  (keeps tapOut in graph)                         │
         │   = fbSink       │                                                 │
         │        │          │                                                 │
         │        │          ▼                                                 │
         │        │    ┌───────────┐                                           │
         │        │    │  × dryWet │  (wet gain)                               │
         │        │    │  WET PATH │                                           │
         │        │    └─────┬─────┘                                           │
         │        │          │                                                 │
         ▼        ▼          ▼                                                 │
      ┌──────────────────────────────────┐
      │   el.add (dry + wet + fbSink)    │
      └──────────────────┬───────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │ × outputVol │
                  └──────┬──────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  el.scope   │ ──────▶ Oscilloscope UI
                  └──────┬──────┘
                         │
                         ▼
               ┌───────────────────┐
               │  engine.render()  │
               │  (L + R stereo)   │
               └────────┬──────────┘
                        │
                        ▼
               ┌───────────────────┐
               │ AudioContext.dest  │
               │    (speakers)     │
               └───────────────────┘
```

### Global feedback loop detail

Unlike the Shepard Delay page (where each `el.delay` has its own per-voice feedback),
this version uses `el.tapIn` / `el.tapOut` for a **single global feedback path**:

```
                       ┌──────────────────────────────────────────┐
                       │                                          │
   input ──▶ (+) ──▶ [ delay voices ] ──▶ rawSum ──▶ el.tapOut ──┘
              ▲                                        ("global-fb")
              │
        el.tapIn × feedback
       ("global-fb")

   The raw (un-enveloped) sum is what feeds back, preserving
   smooth Shepard crossfades only on the audible output path.
   The enveloped/shaped sum goes to the wet output.
```

### Grain-based pitch shifting

The delay time sweeps linearly over `grainSizeSamples` per phasor cycle.
This creates a Doppler-like pitch shift where:

```
   pitchRatio = 1 + (grainSizeSamples × speed) / sampleRate

   grainSizeSamples = (intervalRatio - 1) × sampleRate / speed
```

---

## Summary Comparison

| Feature              | Glissando         | Shepard Delay       | Shepard Delay GFB     |
|----------------------|-------------------|---------------------|-----------------------|
| **Input**            | None (synthesis)  | Mic or File         | Mic or File           |
| **Core DSP**         | el.cycle (sine)   | el.delay            | el.delay              |
| **Frequency sweep**  | Quadratic ramp    | —                   | —                     |
| **Delay sweep**      | —                 | Quadratic ramp      | Linear (grain-based)  |
| **Feedback type**    | —                 | Per-voice (local)   | Global (tapIn/tapOut) |
| **Envelope**         | sin-based cycle   | sin w/ exponent     | cos-based window      |
| **Dry/Wet mix**      | No (synth only)   | Yes                 | Yes                   |
| **Output chain**     | gain → scope      | outputVol → scope   | outputVol → scope     |
| **Engine**           | glissando-engine  | delay-engine        | delay-engine          |
| **Engine inputs**    | 0                 | 1                   | 1                     |
