// Rot Blocker — procedural blip audio engine.
// Loaded as a plain script before overlay.js (see manifest content_scripts),
// so it's available as the global `RotBlips`.
//
// Synthesizes a short per-character "blip" tone (Undertale style) with the Web
// Audio API, so no audio asset files are needed. Each blip is a single
// oscillator with a quick attack/decay gain envelope — a clean "tick".

var RotBlips = (function () {
  let ctx = null;

  // Lazily create the shared AudioContext. Browsers start it "suspended" until
  // a user gesture, so play() also nudges resume() and callers may call
  // resume() from a gesture handler (wired more thoroughly in Task 4).
  function getCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  // Resume the context (best called from within a user-gesture handler).
  function resume() {
    const c = getCtx();
    if (c && c.state === "suspended") c.resume();
  }

  // Compute the (optionally jittered) pitch for a blip.
  // Pure aside from Math.random when jitter > 0.
  function computeBlipFreq(profile) {
    const base = profile && profile.freq ? profile.freq : 440;
    const jitter = profile && profile.jitter ? profile.jitter : 0;
    if (!jitter) return base;
    return base + (Math.random() * 2 - 1) * jitter;
  }

  // Play one short blip from a { type, freq, jitter, durationMs, gain } profile.
  // Stays silent (no error) until the context is actually running.
  function play(profile) {
    const c = getCtx();
    if (!c) return;
    if (c.state === "suspended") {
      // Not allowed to make sound yet — try to unlock for the next character.
      c.resume();
      return;
    }
    if (c.state !== "running") return;

    const p = profile || {};
    const durationMs = p.durationMs || 60;
    const peak = p.gain != null ? p.gain : 0.15;
    const now = c.currentTime;
    const dur = durationMs / 1000;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = p.type || "square";
    osc.frequency.value = computeBlipFreq(p);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  return { play, resume, computeBlipFreq };
})();
