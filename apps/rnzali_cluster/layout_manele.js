'use strict';
/**
 * layout_manele.js - "Manele Edition" (theme 02): RNZ as a party character in the middle of the cluster, his head from
 * a photo on a cartoon body, drawn by the cluster (shaders.js MANELE_BODY_FS, MANELE_HEAD_FS).
 * - Accelerating: he dances to manele, as hard as the car pulls; flat out, the special dance (and money rains).
 * - Braking: panic, big eyes, a jolt, his trousers slip down to red briefs with hearts; after it he pulls them up.
 * - Turn signal: the arm on that side points and waves in the signal's rhythm, the dance going on underneath.
 * - Idle: he breathes, blinks, smirks, shrugs now and then. High revs: excited; high speed: amazed.
 * What he does is decided on the head unit (manele_state.js), at most ~30 times a second, and sent as two small
 * uniforms when it changes; the motion itself runs on the cluster's clock.
 *
 * Around him, as in Horizon: the speed arc on the left with oil and coolant, the gear, drive mode and engine speed
 * right of him, the ranges and charge right of the KOMBI's box. He stays inside his own rectangle, clear of the
 * warning lights, the camera's cowl and the readings.
 *
 * Copyright (C) 2026 RNZALI. GPL-3.0-or-later.
 */
const fs = require('fs');
const path = require('path');
const C = require('./layout_common');
const { parts: P } = require('./layout_horizon');
const { createManele } = require('./manele_state');

/* the head: 160x200 RGBA, the photo's x 138-218, y 0-100 at 2x, the sky keyed out, cut under the chin */
const HEAD_W = 160, HEAD_H = 200;
let headPx = null;
const head = () => {
    if (!headPx) {
        try { headPx = fs.readFileSync(path.join(__dirname, 'manele_head.wad')); } catch (e) { headPx = Buffer.alloc(HEAD_W * HEAD_H * 4); }
    }
    return { key: 'manele_head', w: HEAD_W, h: HEAD_H, px: headPx };
};
/* in the head's picture (0..1): the mouth (centre x, line y, half width, chin's foot y), the eyes (left x, y, right x, y) */
const MOUTH = [0.475, 0.775, 0.1375, 0.94], EYES = [0.275, 0.52, 0.5625, 0.51];
/* the character's design space (shaders.js): his rectangle keeps this shape at any size */
const DW = 440, DH = 524;

/** The character over x, y, w wide (the height follows): the body, then the head in front, one state machine. */
function character(o, x, y, w) {
    const h = Math.round(w * DH / DW);
    const m = createManele({ redline: () => o.redline || 7000 });
    const dyn = (d) => { const s = m.step(d); return { u_pose: s.pose, u_mood: s.mood }; };
    return [
        { key: 'manBody', kind: 'manBody', x, y, w, h, dyn, state: m },
        { key: 'manHead', kind: 'manHead', x, y, w, h, dyn, image: head(), params: { u_mouth: MOUTH, u_eyes: EYES },
            colors: () => ({ inside: '#2a0608', teeth: '#f2efe6', tongue: '#b8323c' }) },
    ];
}
/** The engine speed as a segmented bar, its red zone from the red line. */
const rpmBar = (o, x, y, w, h) => {
    const s = C.rpmScale(o);
    return Object.assign(C.bar('rpmBar', x, y, w, h, (d) => (C.isNum(d.rpm) ? d.rpm / 1000 / s.max : 0), P.bandColours, 24),
        { params: { u_geo: [4, h / 2, 0, Math.max(4, h - 8)], u_span: [0, 0, 24, 0.25], u_marks: [0, 0, 0, 0], u_red: [s.red / s.max] } });
};

module.exports = {
    id: 'manele',
    title: 'Manele Edition',
    palette: (look) => P.PALETTES[look] || P.PALETTES.comfort,
    gearText: C.gearText,
    needs: [],
    DW, DH, MOUTH, EYES,

    pieces(o) {
        if (o.centre === 'map') {
            // he dances left of the map; the speed and gear right of it; the ranges under it
            const bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat(character(o, 40, 200, 330), [
                C.text('speedDigits', 1510, 134, 250, 88, (d) => C.speedText(o, d), P.big),
                C.text('speedUnit', 1510, 224, 250, 20, C.speedUnit(o), P.lbl, { tracking: 0.2 }),
                C.text('gear', 1680, 470, 200, 110, C.gearText, P.gearC),
                C.text('mode', 1680, 586, 200, 20, C.modeText, P.modeC, { tracking: 0.2 }),
            ],
            C.readingUp('fuel', 440, bot + 2, 240, 30, (d) => C.distText(o, d.frange), 'FUEL RANGE', P.txt, P.lbl),
            C.readingUp('elec', 690, bot + 2, 260, 30, C.focus.both(o), C.focus.rangeLabel(o), C.engineFocus(o) ? P.txt : P.evTxt, P.lbl),
            C.readingUp('rpmUp', 960, bot + 2, 160, 30, P.rpmTxt, 'RPM', P.txt, P.lbl),
            C.readingUp('coolantUp', 1130, bot + 2, 160, 30, (d) => C.tempText(o, d.coolant), 'COOLANT', P.hotC('coolant', 118), P.lbl));
        }
        const stock = o.centre === 'stock';
        const list = [C.flat('bg', 0, 0, 1920, 720, 'bg')];
        if (stock) list[0] = C.flat('bg', 0, 0, 820, 720, 'bg'), list.push(C.flat('bgR', 1100, 0, 820, 720, 'bg'));
        list.push(
            P.speedArc(o, 380, 400, 280, 18, 22),
            C.text('speedDigits', 230, 300, 300, 150, (d) => C.speedText(o, d), P.big),
            C.text('speedUnit', 230, 458, 300, 24, C.speedUnit(o), P.lbl, { tracking: 0.25 }),
        );
        list.push(...P.temps(o, 60, 604, 220, 40));
        list.push(...P.rightColumn(o));
        if (stock) {
            // he dances between the stock centre and the KOMBI's box, the gear under him
            return list.concat(character(o, 1110, 150, 290), [
                C.text('gear', 1110, 548, 140, 80, C.gearText, P.gearC),
                C.text('rpmDigits', 1262, 576, 140, 30, P.rpmTxt, P.lbl, { tracking: 0.1 }),
            ]);
        }
        // he dances in the middle, under the camera's cowl, above the warning lights (an M car's boxes sit on him);
        // right of him, left of the KOMBI's box: the gear, the drive mode, the engine speed, the time and outside
        return list.concat(character(o, 745, 128, 440), [
            C.text('gear', 1192, 140, 208, 150, C.gearText, P.gearC),
            C.text('mode', 1192, 292, 208, 20, C.modeText, P.modeC, { tracking: 0.2 }),
            rpmBar(o, 1192, 456, 208, 24),
            C.text('rpmDigits', 1192, 490, 208, 36, P.rpmTxt, P.txt),
            C.text('rpmLbl', 1192, 530, 208, 16, 'RPM', P.lbl, { tracking: 0.3 }),
            C.text('clock', 1192, 574, 100, 30, C.clock, P.txt, { align: 0 }),
            C.text('outside', 1296, 574, 104, 30, (d) => C.outsideText(o, d.outside), P.txt, { align: 1 }),
        ]);
    },
};
