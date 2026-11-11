'use strict';
/**
 * test_manele.js - the "Manele Edition" character's state machine (apps/rnzali_cluster/manele_state.js) on simulated
 * car data, on a simulated clock: idle, progressive and full acceleration, light and hard braking, the turn signals,
 * their combinations, losing the car's data and getting it back.
 *   node tools/test_manele.js
 */
const assert = require('assert');
const path = require('path');
const { createManele } = require(path.join(__dirname, '..', 'apps', 'rnzali_cluster', 'manele_state'));

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };
/** A machine and a clock: run(ms, data) steps it every 33 ms (the engine's rate) and returns the last output. */
function sim() {
    const m = createManele({ redline: 7000 });
    let now = 1000000, out = null;
    const run = (ms, d) => { const end = now + ms; while (now < end) { now += 33; out = m.step(typeof d === 'function' ? d(now) : d, now); } return out; };
    return { m, run, out: () => out };
}
const cruise = { speed: 60, rpm: 1800, gLong: 0, torque: 20, kw: 0, turn: 0 };
const w = (o) => Object.assign({}, cruise, o);

check('idle: relaxed, nothing on (and nothing sent: the pose holds at 0)', () => {
    const o = sim().run(3000, cruise);
    assert.strictEqual(o.mode, 'idle');
    assert.deepStrictEqual(o.pose, [0, 0, 0, 0]);
    assert.deepStrictEqual(o.mood, [0, 0, 0, 0]);
});
check('progressive acceleration: the dance grows with the push, no special dance', () => {
    const s = sim();
    const a = s.run(1500, w({ gLong: 0.10 })), b = s.run(1500, w({ gLong: 0.18 })), c = s.run(1500, w({ gLong: 0.25 }));
    assert(a.mode === 'dance' && a.dance > 0.1, 'dance at 0.10 g: ' + a.dance);
    assert(b.dance > a.dance && c.dance > b.dance, [a.dance, b.dance, c.dance].join(' < '));
    assert(c.special < 0.05, 'no special dance under 90 %');
});
check('full acceleration: the special dance, for 2.5 s, then not again within its cooldown', () => {
    const s = sim();
    s.run(500, cruise);
    const o = s.run(1000, w({ torque: 420 }));
    assert(o.special > 0.9 && o.dance > 0.9, 'special ' + o.special);
    const after = s.run(2500, w({ torque: 420 }));
    assert(after.special < 0.1, 'over after 2.5 s: ' + after.special);
    s.run(1000, cruise);
    assert(s.run(1000, w({ torque: 420 })).special < 0.1, 'cooldown: not again so soon');
});
check('light braking (engine braking, -0.15 g): no panic', () => {
    const o = sim().run(3000, w({ gLong: -0.15, torque: 0 }));
    assert.strictEqual(o.mode, 'idle');
    assert(o.panic < 0.05 && o.pants < 0.05);
});
check('a short dip (-0.4 g for 150 ms): no panic (debounce)', () => {
    const s = sim();
    s.run(500, cruise);
    s.run(150, w({ gLong: -0.4, torque: 0 }));
    const o = s.run(1000, cruise);
    assert(o.panic < 0.05 && !o.braking);
});
check('hard braking: panic, trousers down; released: pulled up again, back to normal', () => {
    const s = sim();
    s.run(500, cruise);
    const o = s.run(1000, w({ gLong: -0.6, torque: 0 }));
    assert(o.mode === 'panic' && o.braking && o.strong, o.mode);
    assert(o.panic > 0.9 && o.pants > 0.9, 'panic ' + o.panic + ' pants ' + o.pants);
    const held = s.run(300, cruise);
    assert(held.braking, 'hysteresis: still braking 300 ms after');
    const done = s.run(2500, cruise);
    assert(!done.braking && done.mode === 'idle' && done.panic < 0.05 && done.pants < 0.05, JSON.stringify(done.pose) + JSON.stringify(done.mood));
});
check('moderate braking (-0.35 g): panic, not the strongest', () => {
    const o = sim().run(1000, w({ gLong: -0.35, torque: 0 }));
    assert(o.braking && !o.strong && o.panic > 0.7 && o.panic < 0.85, String(o.panic));
});
check('a second braking within 3 s: no new panic (cooldown)', () => {
    const s = sim();
    s.run(800, w({ gLong: -0.5, torque: 0 }));
    s.run(700, cruise);
    assert(!s.run(500, cruise).braking);
    assert(!s.run(600, w({ gLong: -0.5, torque: 0 })).braking, 'within the cooldown');
});
check('left turn signal: the left arm points and waves for as long as it is on', () => {
    const s = sim();
    const o = s.run(1000, w({ turn: -1 }));
    assert(o.mode === 'turn' && o.left > 0.95 && o.right < 0.05);
    assert(s.run(1000, cruise).left < 0.05, 'off again');
});
check('right turn signal: the right arm, mirrored', () => {
    const o = sim().run(1000, w({ turn: 1 }));
    assert(o.mode === 'turn' && o.right > 0.95 && o.left < 0.05);
});
check('hazards: both arms', () => {
    const o = sim().run(1000, w({ turn: 2 }));
    assert(o.left > 0.95 && o.right > 0.95);
});
check('turn signal while accelerating: the arm points, the dance goes on underneath', () => {
    const o = sim().run(1500, w({ turn: -1, gLong: 0.22 }));
    assert(o.mode === 'turn' && o.left > 0.95 && o.dance > 0.4, JSON.stringify(o.pose));
});
check('braking with the turn signal on: the panic first', () => {
    const o = sim().run(1000, w({ turn: 1, gLong: -0.6, torque: 0 }));
    assert(o.mode === 'panic' && o.panic > 0.9, o.mode);
});
check('braking stops the dance', () => {
    const s = sim();
    s.run(1500, w({ gLong: 0.25 }));
    const o = s.run(1500, w({ gLong: -0.6, torque: 0 }));
    assert(o.mode === 'panic' && o.dance < 0.1, String(o.dance));
});
check('high revs: excited; high speed: amazed; a quick push: a jolt', () => {
    assert(sim().run(1500, w({ rpm: 6200 })).excited > 0.9);
    assert(sim().run(2000, w({ speed: 150 })).amazed > 0.9);
    const s = sim();
    s.run(500, cruise);
    assert(s.run(100, w({ torque: 330 })).jolt > 0.5, 'jolt');
});
check('car data lost: idle, the braking forgotten; data back: as before', () => {
    const s = sim();
    s.run(1000, w({ gLong: -0.6, torque: 0 }));
    const lost = s.run(3000, {});
    assert(lost.mode === 'idle' && !lost.braking && !lost.live, lost.mode);
    assert(lost.panic < 0.05 && lost.pants < 0.05 && lost.dance < 0.05);
    const back = s.run(1500, w({ gLong: 0.2 }));
    assert(back.mode === 'dance' && back.live && back.dance > 0.3, JSON.stringify(back.pose));
});
check('a moment without data (under 1.5 s) keeps going', () => {
    const s = sim();
    s.run(1000, w({ turn: -1 }));
    const o = s.run(600, {});
    assert(o.live, 'still live');
});
check('what is sent is in steps of 0.05, and nothing changes while the car holds still', () => {
    const s = sim();
    s.run(2000, w({ gLong: 0.17 }));
    const a = JSON.stringify([s.out().pose, s.out().mood]);
    const b = s.run(2000, w({ gLong: 0.17 }));
    assert.strictEqual(JSON.stringify([b.pose, b.mood]), a);
    b.pose.concat(b.mood).forEach((v) => assert(Math.abs(v * 20 - Math.round(v * 20)) < 1e-9, String(v)));
});

check('the turn signals as the car sends them (names or numbers, either field): left, right, hazards, off', () => {
    const { turnOf } = require(path.join(__dirname, '..', 'shared', 'indicators'));
    assert.strictEqual(turnOf({ controlIndicateDirection: 'DAUER_BLINKEN_LINKS_EIN' }), -1);
    assert.strictEqual(turnOf({ value: { controlIndicateDirection: 2 } }), 1);
    assert.strictEqual(turnOf({ controlIndicateDirection: 'BEIDSEITIGES_BLINKEN_EIN' }), 2);
    assert.strictEqual(turnOf({ controlIndicateDirection: 0, activeFunctionIndicateDirection: 'TIPPBLINKEN_RECHTS' }), 1);
    assert.strictEqual(turnOf({ controlIndicateDirection: 'BLINKEN_AUS', activeFunctionIndicateDirection: 0 }), 0);
    assert.strictEqual(turnOf({ somethingElse: 1 }), null);
});

console.log(ok + ' passed');
