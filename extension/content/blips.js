// Rot Blocker — procedural blip audio engine.
// Loaded as a plain script before overlay.js (see manifest content_scripts),
// so it's available as the global `RotBlips`.
//
// Synthesizes a short per-character "blip" tone (Undertale style) with the Web
// Audio API, so no audio asset files are needed. Each blip is a single
// oscillator with a quick attack/decay gain envelope — a clean "tick".

var RotBlips = (function () {
  let ctx = null;
  let muted = false;
  let unlockInstalled = false;

  // Lazily create the shared AudioContext. Browsers start it "suspended" until
  // a user gesture, so we also install a first-gesture unlock (installUnlock).
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

  // Mute toggle — suppresses audio while leaving the typewriter untouched.
  function setMuted(v) {
    muted = !!v;
  }
  function isMuted() {
    return muted;
  }

  // Play an inaudible tick to fully spin up the audio pipeline, so the first
  // *real* blip after unlocking fires instantly instead of after a warm-up lag.
  function warmUp() {
    const c = getCtx();
    if (!c || c.state !== "running") return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + 0.02);
    } catch (e) {
      /* no-op */
    }
  }

  // Unlock audio: resume the context (async) then warm it up.
  function unlock() {
    const c = getCtx();
    if (!c) return;
    if (c.state === "suspended") {
      c.resume().then(warmUp).catch(function () {});
    } else {
      warmUp();
    }
  }

  // Install one-time capture-phase listeners so the *first* user interaction
  // anywhere unlocks audio — replies then have sound with no start-up delay.
  function installUnlock() {
    if (unlockInstalled) return;
    unlockInstalled = true;
    const handler = function () {
      unlock();
      window.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("touchstart", handler, true);
    };
    window.addEventListener("pointerdown", handler, true);
    window.addEventListener("keydown", handler, true);
    window.addEventListener("touchstart", handler, true);
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
  // Stays silent (no error) when muted or until the context is running.
  function play(profile) {
    if (muted) return;
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

  return { play, resume, unlock, installUnlock, setMuted, isMuted, computeBlipFreq };
})();
