import WebRenderer from "@elemaudio/web-renderer";
import type { NodeRepr_t } from "@elemaudio/core";

let ctx: AudioContext | null = null;
let core: WebRenderer | null = null;
let elemNode: AudioNode | null = null;
let initialized = false;
let initializing = false;

let micStream: MediaStream | null = null;
let currentSource: AudioNode | null = null;
const elementSources = new WeakMap<
  HTMLAudioElement,
  MediaElementAudioSourceNode
>();

type ScopeCallback = (data: Float32Array) => void;
let scopeListener: ScopeCallback | null = null;

export function onScope(cb: ScopeCallback) {
  scopeListener = cb;
}

export async function ensureInitialized(): Promise<WebRenderer> {
  if (core && initialized) return core;
  if (initializing) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (core && initialized) {
          clearInterval(check);
          resolve(core);
        }
      }, 50);
    });
  }

  initializing = true;
  ctx = new AudioContext();
  core = new WebRenderer();

  core.on("scope", (e) => {
    if (e.source === "scope" && e.data.length && scopeListener) {
      scopeListener(e.data[0]);
    }
  });

  const node = await core.initialize(ctx, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });

  elemNode = node;
  node.connect(ctx.destination);
  initialized = true;
  initializing = false;

  return core;
}

export async function connectMic(): Promise<void> {
  disconnectSource();
  if (!ctx || !elemNode) throw new Error("Engine not initialized");
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  currentSource = ctx.createMediaStreamSource(micStream);
  currentSource.connect(elemNode);
}

export function connectFileElement(audioEl: HTMLAudioElement): void {
  disconnectSource();
  if (!ctx || !elemNode) throw new Error("Engine not initialized");
  let source = elementSources.get(audioEl);
  if (!source) {
    source = ctx.createMediaElementSource(audioEl);
    elementSources.set(audioEl, source);
  }
  source.connect(elemNode);
  currentSource = source;
}

export function disconnectSource(): void {
  currentSource?.disconnect();
  currentSource = null;
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

export function render(signal: NodeRepr_t) {
  if (core && initialized) {
    core.render(signal, signal);
  }
}

export function suspend() {
  ctx?.suspend();
}

export function resume() {
  ctx?.resume();
}

export function getSampleRate(): number {
  return ctx?.sampleRate ?? 44100;
}
