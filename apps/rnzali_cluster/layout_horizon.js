'use strict';
/**
 * layout_horizon.js - "Horizon", RNZALI Cluster's first layout. Two open arcs rise like horizons over a black
 * panel: the road speed on the left with the digits large inside it, the engine speed on the right with the
 * gear low inside it and the drive mode across its top. A narrow column between them holds the time, outside
 * temperature and the power; oil and coolant run as slim bars under the speed arc; the ranges and the charge sit
 * right of the KOMBI's dark box.
 *
 * Kept clear of what the glass and the KOMBI hide (layout_common: the camera's cowl, the gear box, the eDrive
 * box, the slanted corners, the warning lights). The middle of the rev arc is left empty on purpose: that is
 * where an M car's KOMBI puts its two boxes, so the same layout works there (only the arc's ink passes them).
 *
 * Copyright (C) 2026 RNZALI. GPL-3.0-or-later.
 */
const C = require('./layout_common');

const PALETTES = {
    comfort: {
        bg: '#000000', track: '#10161d', fill0: '#2a6fb0', fill1: '#d8f0ff', tip: '#ffffff', red: '#ff4433',
        tick: '#46576a', num: '#b9c9da', text: '#f4f8fc', glow: '#5fb4ff', dim: '#8a97a5', ev: '#4ab4ff',
        accent: '#5fb4ff', rule: '#1a2430', mode: 'COMFORT',
    },
    sport: {
        bg: '#000000', track: '#1d1210', fill0: '#b84a12', fill1: '#ffd38a', tip: '#fff2dc', red: '#ff2a14',
        tick: '#6a4a3e', num: '#e8c2a8', text: '#fff7ef', glow: '#ff8a2a', dim: '#a8968a', ev: '#4ab4ff',
        accent: '#ff8a2a', rule: '#2e1c14', mode: 'SPORT',
    },
    efficient: {
        bg: '#000000', track: '#0c1915', fill0: '#178a6a', fill1: '#c8ffe8', tip: '#effff8', red: '#ff4433',
        tick: '#3a5a50', num: '#a8d8c8', text: '#f0fff9', glow: '#2fe0a8', dim: '#8aa69c', ev: '#2fe0a8',
        accent: '#2fe0a8', rule: '#14302a', mode: 'EFFICIENT',
    },
};

const bandColours = (t) => ({ track: t.track, fill0: t.fill0, fill1: t.fill1, redc: t.red, tip: t.tip, tick: t.tick, num: t.num });
const big = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.5] });
const txt = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.15] });
const lbl = (t) => ({ color: [t.dim, 1], glow: [t.glow, 0] });
const evTxt = (t) => ({ color: [t.ev, 1], glow: [t.ev, 0.3] });
const modeC = (t) => ({ color: [t.accent, 1], glow: [t.accent, 0.6] });
const gearC = (t, d) => ({ color: [C.gearText(d) === 'R' ? t.red : t.text, 1], glow: [t.glow, 0.5] });
const hotC = (k, lim) => (t, d) => ({ color: [C.isNum(d[k]) && d[k] >= lim ? t.red : t.text, 1], glow: [t.glow, 0] });
const rpmTxt = (d) => (C.isNum(d.rpm) ? String(Math.round(d.rpm / 50) * 50) : '--');

/**
 * An open arc around (cx, cy): radius r, thickness th, from -a to +a degrees (0 at twelve o'clock), with the
 * scale's numerals inside it. value(d) 0..1; marks major marks, step the value at each, red from 0..1.
 */
function arc(key, cx, cy, r, th, a, value, marks, step, red, numH) {
    const pad = th + 12;          // the numerals sit inside the arc: only the band and its tip's glow go outside
    const x = Math.max(0, Math.round(cx - r - pad)), y = Math.max(0, Math.round(cy - r - pad));
    const w = Math.min(1920 - x, Math.round(cx + r + pad) - x), h = Math.min(720 - y, Math.round(cy + r + pad) - y);
    return {
        key, kind: 'band', x, y, w, h,
        params: { u_geo: [cx - x, cy - y, r, th], u_span: [-a, a, 0, 0], u_marks: [marks, step, numH, -Math.round(numH * 1.6 + th / 2)], u_red: [red] },
        colors: bandColours, value, max: 1, sweep: true,
    };
}
const speedArc = (o, cx, cy, r, th, numH) => {
    const s = C.speedScale(o);
    return arc('speed', cx, cy, r, th, 130, (d) => (C.isNum(d.speed) ? C.speedIn(o, d.speed) / s.max : 0), s.max / s.major, s.major, 2, numH);
};
const rpmArc = (o, cx, cy, r, th, numH) => {
    const s = C.rpmScale(o);
    return arc('rpmArc', cx, cy, r, th, 130, (d) => (C.isNum(d.rpm) ? d.rpm / 1000 / s.max : 0), s.max, 1, s.red / s.max, numH);
};
/** A slim bar with its label and value on one line above it; frac(d) 0..1. */
function slim(key, x, y, w, label, valueText, frac, colourText) {
    return [
        C.text(key + 'Lbl', x, y, Math.round(w * 0.5), 18, label, lbl, { align: 0, tracking: 0.12 }),
        C.text(key, x + Math.round(w * 0.5), y - 4, Math.round(w * 0.5), 24, valueText, colourText, { align: 1 }),
        C.bar(key + 'Bar', x, y + 24, w, 16, frac, (t) => ({ track: t.track, fill0: t.fill0, fill1: t.fill1, redc: t.red, tip: t.tip, tick: t.dim, num: t.num }), 0),
    ];
}
/* oil and coolant on 40-140 °C, red from 130 / 118 */
const temps = (o, x, y, w, gap) => slim('oil', x, y, w, 'OIL', (d) => C.tempText(o, d.oil), (d) => C.tempFrac(d.oil), hotC('oil', 130))
    .concat(slim('coolant', x + w + gap, y, w, 'COOLANT', (d) => C.tempText(o, d.coolant), (d) => C.tempFrac(d.coolant), hotC('coolant', 118)))
    .map((p) => (/Bar$/.test(p.key) ? Object.assign(p, { params: Object.assign({}, p.params, { u_red: [p.key === 'oilBar' ? 0.9 : 0.78] }) }) : p));
/* right of the KOMBI's dark box: the ranges and the charge (or boost and timing on a petrol or diesel car) */
const rightColumn = (o) => {
    const X = 1672, W = 216;
    return [].concat(
        C.reading('fuel', X, 292, W, 44, (d) => C.distText(o, d.frange), 'FUEL RANGE', txt, lbl),
        C.reading('elec', X, 400, W, 44, C.focus.range(o), C.focus.rangeLabel(o), C.engineFocus(o) ? txt : evTxt, lbl),
        [C.text('socTxt', X, 506, W, 40, C.focus.charge(o), C.engineFocus(o) ? txt : evTxt),
            C.bar('soc', X + 8, 560, W - 16, 14, C.focus.bar(o), (t) => ({ track: t.track, fill0: C.engineFocus(o) ? t.accent : t.ev, fill1: C.engineFocus(o) ? t.accent : t.ev, redc: t.red, tip: t.tip, tick: t.dim, num: t.num }), 20)],
    );
};

/* the parts other RNZALI layouts reuse (layout_face.js) */
const parts = { PALETTES, bandColours, big, txt, lbl, evTxt, modeC, gearC, hotC, rpmTxt, arc, speedArc, rpmArc, temps, rightColumn };

module.exports = {
    parts,
    id: 'horizon',
    title: 'Horizon',
    palette: (look) => PALETTES[look] || PALETTES.comfort,
    gearText: C.gearText,

    pieces(o) {
        if (o.centre === 'map') {
            // the speed arc left of the map, the gear above the KOMBI's box, a small rev arc below it, the
            // ranges and temperatures in the strip under the map
            const bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat([
                speedArc(o, 208, 380, 168, 14, 16),
                C.text('speedDigits', 98, 318, 220, 96, (d) => C.speedText(o, d), big),
                C.text('speedUnit', 98, 420, 220, 20, C.speedUnit(o), lbl, { tracking: 0.2 }),
                C.text('clock', 30, 560, 170, 30, C.clock, txt, { align: 0 }),
                C.text('outside', 216, 560, 170, 30, (d) => C.outsideText(o, d.outside), txt, { align: 1 }),
                C.text('gear', 1510, 130, 250, 96, C.gearText, gearC),
                C.text('mode', 1510, 230, 250, 20, C.modeText, modeC, { tracking: 0.2 }),
                rpmArc(o, 1745, 560, 100, 12, 13),
                C.text('rpmDigits', 1695, 540, 100, 26, rpmTxt, txt),
            ],
            C.readingUp('fuel', 440, bot + 2, 240, 30, (d) => C.distText(o, d.frange), 'FUEL RANGE', txt, lbl),
            C.readingUp('elec', 690, bot + 2, 260, 30, C.focus.both(o), C.focus.rangeLabel(o), C.engineFocus(o) ? txt : evTxt, lbl),
            C.readingUp('oilUp', 960, bot + 2, 160, 30, (d) => C.tempText(o, d.oil), 'OIL', hotC('oil', 130), lbl),
            C.readingUp('coolantUp', 1130, bot + 2, 160, 30, (d) => C.tempText(o, d.coolant), 'COOLANT', hotC('coolant', 118), lbl));
        }
        const stock = o.centre === 'stock';
        // the speed arc on the left, the digits large inside it
        const list = [C.flat('bg', 0, 0, 1920, 720, 'bg')];
        if (stock) list[0] = C.flat('bg', 0, 0, 820, 720, 'bg'), list.push(C.flat('bgR', 1100, 0, 820, 720, 'bg'));
        list.push(
            speedArc(o, 380, 400, 280, 18, 22),
            C.text('speedDigits', 230, 300, 300, 150, (d) => C.speedText(o, d), big),
            C.text('speedUnit', 230, 458, 300, 24, C.speedUnit(o), lbl, { tracking: 0.25 }),
        );
        list.push(...temps(o, 60, 604, 220, 40));
        list.push(...rightColumn(o));
        if (stock) {
            // a smaller rev arc between the stock centre and the KOMBI's box, the gear inside it
            return list.concat([
                rpmArc(o, 1265, 400, 130, 14, 14),
                C.text('gear', 1190, 430, 150, 96, C.gearText, gearC),
                C.text('rpmDigits', 1190, 530, 150, 22, rpmTxt, lbl, { tracking: 0.1 }),
            ]);
        }
        return list.concat([
            // the rev arc left of the KOMBI's box; its middle stays empty (an M car's boxes)
            rpmArc(o, 1100, 400, 250, 18, 20),
            C.text('mode', 990, 226, 220, 24, C.modeText, modeC, { tracking: 0.25 }),
            C.text('gear', 990, 430, 210, 140, C.gearText, gearC),
            C.text('rpmDigits', 1010, 574, 180, 26, rpmTxt, lbl, { tracking: 0.1 }),
            // the narrow column between the arcs: time and outside above, the power below (clear of the M boxes)
            C.text('clock', 680, 160, 150, 36, C.clock, txt),
            C.text('outside', 680, 206, 150, 30, (d) => C.outsideText(o, d.outside), txt),
            C.flat('rule1', 700, 250, 110, 2, 'rule'),
        ], C.reading('kw', 680, 420, 150, 40, C.focus.power(o), C.focus.powerLabel(o), C.engineFocus(o) ? txt : evTxt, lbl));
    },
};
