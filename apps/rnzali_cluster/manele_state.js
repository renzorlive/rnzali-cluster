'use strict';
/**
 * manele_state.js - what the "Manele Edition" character does, from the car's data: a small state machine on the head
 * unit. It runs ~30 times a second (the engine's text and colour rate) and gives the shaders a few eased numbers.
 * Every motion itself (the dance, the waving, the breathing, the blinking) is played by the cluster on its own clock
 * (shaders.js MANELE_*), so while nothing changes nothing is sent.
 *
 * Priorities: braking (panic, the trousers come down) > the turn signal (an arm points and waves; the dance goes on
 * underneath) > accelerating (the dance, as strong as the push) > idle.
 *
 * Signals (data.js, all real): gLong (the car's longitudinal acceleration, g: + speeding up, - slowing down),
 * torque (Nm), kw (the battery's power), rpm, speed (km/h), turn (-1 left, 1 right, 2 both / hazards, 0 off;
 * de.bmw.body.Light). The car has no brake pedal signal here: braking is taken from the deceleration (gLong), held
 * for a moment, so the trousers come down on real braking and not on every lift of the throttle.
 *
 * Copyright (C) 2026 RNZALI. GPL-3.0-or-later.
 */
const isNum = (v) => typeof v === 'number' && isFinite(v);

const T = {
    brakeIn: -0.30,          // g: braking, held brakeInMs ...
    brakeInMs: 250,
    brakeStrong: -0.50,      // g: hard braking (the strongest panic)
    brakeOut: -0.12,         // g: over this for brakeOutMs, the braking is over (hysteresis)
    brakeOutMs: 400,
    panicCooldownMs: 3000,   // between two panics
    pantsHoldMs: 400,        // the trousers stay down this long after the braking, then he pulls them up
    specialAt: 0.9,          // push 0..1: the special dance from here ...
    specialMs: 2500,         // ... for this long
    specialCooldownMs: 8000,
    joltDelta: 0.35,         // push rising this much within joltWindowMs: a jolt (an exaggerated reaction)
    joltWindowMs: 300,
    joltMs: 700,
    excitedFrac: 0.85,       // of the red line
    amazedKmh: 130,
    staleMs: 1500,           // no car data for this long: idle, every timer reset
    deadzone: 0.08,          // push under this: no dance
};

/** How hard the car accelerates, 0..1: the push (g), the engine's torque, the battery's power: the most. */
function pushOf(d) {
    const n = (v, full) => (isNum(v) ? v / full : 0);
    const p = Math.max(0, Math.min(1, Math.max(n(d.gLong, 0.3), n(d.torque, 350), n(d.kw, 70))));
    return p < T.deadzone ? 0 : (p - T.deadzone) / (1 - T.deadzone);
}
/* towards target with time constant tau (ms) */
const ease = (v, target, dt, tau) => v + (target - v) * (1 - Math.exp(-dt / Math.max(1, tau)));
const q = (v) => Math.round(v * 20) / 20;      // what is sent: steps of 0.05 (nothing while it holds still)

/**
 * createManele({ redline }) -> { step(d, now) -> out, T }
 * out: { mode: 'idle' | 'dance' | 'turn' | 'panic', push, dance, special, left, right, panic, pants, excited, amazed,
 *        jolt, pose: [dance, special, left, panic], mood: [pants, excited, amazed, right] }
 */
function createManele(opts) {
    opts = opts || {};
    const redline = () => (typeof opts.redline === 'function' ? opts.redline() : opts.redline) || 7000;
    const s = {
        at: 0, lastData: 0, out: null,
        brakeSince: 0, brakeOkSince: 0, braking: false, strong: false, lastPanic: -1e9, brakeEnd: 0,
        specialUntil: 0, lastSpecial: -1e9, pushHist: [], joltUntil: 0,
        dance: 0, special: 0, left: 0, right: 0, panic: 0, pants: 0, excited: 0, amazed: 0, jolt: 0,
    };
    function reset() {
        s.braking = false; s.strong = false; s.brakeSince = 0; s.brakeOkSince = 0; s.specialUntil = 0; s.pushHist = []; s.joltUntil = 0;
    }
    function step(d, now) {
        d = d || {};
        now = isNum(now) ? now : Date.now();
        if (s.out && now - s.at < 8) return s.out;          // both of the character's pieces ask in the same update
        const dt = s.at ? Math.min(250, Math.max(0, now - s.at)) : 0;
        s.at = now;
        const hasData = isNum(d.speed) || isNum(d.rpm) || isNum(d.gLong);
        if (hasData) s.lastData = now;
        const live = hasData || now - s.lastData < T.staleMs;
        if (!live) reset();

        /* braking: from the deceleration, with debounce (in), hysteresis (out) and a cooldown between panics */
        const g = live && isNum(d.gLong) ? d.gLong : 0;
        if (!s.braking) {
            if (g <= T.brakeIn) { if (!s.brakeSince) s.brakeSince = now; } else s.brakeSince = 0;
            if (s.brakeSince && now - s.brakeSince >= T.brakeInMs && now - s.lastPanic >= T.panicCooldownMs) {
                s.braking = true; s.lastPanic = now; s.brakeOkSince = 0;
            }
        } else {
            if (g <= T.brakeStrong) s.strong = true;
            if (g > T.brakeOut) { if (!s.brakeOkSince) s.brakeOkSince = now; } else s.brakeOkSince = 0;
            if (s.brakeOkSince && now - s.brakeOkSince >= T.brakeOutMs) { s.braking = false; s.strong = false; s.brakeSince = 0; s.brakeEnd = now; }
        }

        /* accelerating: the dance follows the push; the special dance at the top, with its cooldown; a jolt on a quick rise */
        const push = live && !s.braking ? pushOf(d) : 0;
        s.pushHist.push([now, push]);
        while (s.pushHist.length && now - s.pushHist[0][0] > T.joltWindowMs) s.pushHist.shift();
        const low = s.pushHist.reduce((m, h) => Math.min(m, h[1]), push);
        if (push - low >= T.joltDelta) s.joltUntil = now + T.joltMs;
        if (push >= T.specialAt && now >= s.specialUntil && now - s.lastSpecial >= T.specialCooldownMs) { s.specialUntil = now + T.specialMs; s.lastSpecial = now; }
        const special = now < s.specialUntil && !s.braking ? 1 : 0;

        /* the turn signal: either side, or both (hazards) */
        const turn = live && isNum(d.turn) ? d.turn : 0;
        const wantL = turn === -1 || turn === 2 ? 1 : 0, wantR = turn === 1 || turn === 2 ? 1 : 0;

        const ex = live && isNum(d.rpm) && d.rpm >= T.excitedFrac * redline() ? 1 : 0;
        const am = live && isNum(d.speed) && d.speed >= T.amazedKmh ? 1 : 0;

        /* eased, so every change blends (the shaders mix the poses by these weights) */
        s.dance = ease(s.dance, push, dt, push > s.dance ? 250 : 600);
        s.special = ease(s.special, special, dt, 200);
        s.left = ease(s.left, wantL, dt, 150);
        s.right = ease(s.right, wantR, dt, 150);
        s.panic = ease(s.panic, s.braking ? (s.strong ? 1 : 0.8) : 0, dt, s.braking ? 90 : 300);
        const pantsDown = s.braking || (s.brakeEnd && now - s.brakeEnd < T.pantsHoldMs);
        s.pants = ease(s.pants, pantsDown ? 1 : 0, dt, pantsDown ? 120 : 350);
        s.excited = ease(s.excited, ex, dt, 300);
        s.amazed = ease(s.amazed, am, dt, 400);
        s.jolt = ease(s.jolt, now < s.joltUntil ? 1 : 0, dt, 80);
        if (!dt) {      // the first step: where it is now, no blend from nothing
            s.dance = push; s.special = special; s.left = wantL; s.right = wantR; s.excited = ex; s.amazed = am;
        }

        const mode = s.braking ? 'panic' : wantL || wantR ? 'turn' : push > 0 ? 'dance' : 'idle';
        s.out = {
            mode, push, live, braking: s.braking, strong: s.strong,
            dance: s.dance, special: s.special, left: s.left, right: s.right, panic: s.panic, pants: s.pants,
            excited: Math.max(s.excited, s.jolt), amazed: s.amazed, jolt: s.jolt,
            pose: [q(s.dance), q(s.special), q(s.left), q(s.panic)],
            mood: [q(s.pants), q(Math.max(s.excited, s.jolt)), q(s.amazed), q(s.right)],
        };
        return s.out;
    }
    return { step, T, _s: s };
}

module.exports = { createManele, pushOf, T };
