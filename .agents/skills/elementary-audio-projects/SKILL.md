---
name: elementary-audio-projects
description: Build, debug, and extend projects that use the Elementary Audio library (@elemaudio/core and @elemaudio/web-renderer). Use when tasks involve DSP graph design, NodeRepr graph composition, voice stacking, modulation, delay/feedback structures, Web Audio integration, parameter smoothing, or troubleshooting artifacts/performance in browser-based audio systems.
---

# Elementary Audio Projects

Follow this workflow when working on an Elementary Audio codebase.

## 1) Map the audio architecture first

- Identify graph entry and exit points before editing DSP:
  - input nodes (`el.in`, media/mic sources)
  - voice builders and mixers (`el.add`, custom add-many helpers)
  - output wiring (`engine.render`, stereo routing)
- Locate user parameter boundaries (UI/component params vs DSP params) and track every transform from UI value to DSP node.
- Prefer tiny, composable graph helpers (`phasedPhasor`, `envelope`, `voice`, `mix`) rather than monolithic graph functions.

## 2) Apply safe graph-construction patterns

- Smooth time-varying controls with `el.sm(el.const({ key, value }))` for click-safe modulation.
- Keep `key` names stable and unique per logical control signal.
- Bound delay and feedback domains explicitly:
  - clamp minimum delay away from zero
  - cap feedback below unstable/self-oscillating extremes unless the design explicitly requires runaway behavior
- For many summed voices, use tree-style summing helpers to avoid giant variadic `el.add` calls.
- Keep per-voice scaling explicit (`1 / numVoices`) before final wet/dry/output gain stages.

## 3) Preserve musical behavior under parameter changes

- Recompute derived parameters from one source of truth (`sampleRate`, `maxDelayMs`, range bounds).
- Keep modulation direction logic explicit (up/down branches) to avoid accidental phase inversions.
- Keep envelope shaping isolated from core frequency/delay mapping so timbre changes do not silently alter motion behavior.

## 4) Integrate with Web Audio predictably

- Confirm input source ownership and lifecycle (mic streams, media elements, connect/disconnect order).
- Ensure graph render calls produce deterministic channel layouts (typically dual mono/stereo `[out, out]`).
- Avoid hidden gain multiplication by documenting gain staging at each step (input, wet/dry, output).

## 5) Debug artifacts methodically

- For zipper noise: inspect missing smoothing or unstable key reuse.
- For silence: check channel source wiring, zeroed gains, and invalid delay ranges.
- For CPU spikes: inspect voice count, recursive graph builders, and expensive per-sample nonlinear chains.
- For tonal drift: inspect phase offset math, wrapping (`sub(floor(x))`), and interval/range mapping.

## 6) Validate changes

- Run project lint/type checks and verify the affected patch audibly in-browser.
- Keep a short manual test script per feature:
  - neutral defaults produce audible output
  - extreme parameter values remain stable
  - no pops when moving core controls quickly

## References

Read [references/elementary-reference-map.md](references/elementary-reference-map.md) when you need API-level refreshers or node selection guidance.
