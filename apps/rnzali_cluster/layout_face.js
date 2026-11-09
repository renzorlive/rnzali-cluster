'use strict';
/**
 * layout_face.js - "RNZ Face": Horizon's speed arc on the left and, in the middle, RNZ's face from a photo, drawn
 * by the cluster (shaders.js FACE_FS). The harder the car accelerates, the wider the mouth opens; near the red
 * line the face shakes and blushes; a glint runs across the sunglasses every few seconds. Right of the face: the
 * gear, the drive mode and the engine speed as a bar; right of the KOMBI's box the ranges and the charge.
 *
 * The photo (face_rnz.wad: 200x276 RGBA, the sky keyed out) is sent once as a texture (~216 KB); while driving
 * only the mouth's opening (one number, when it moves) and the shake go.
 *
 * Copyright (C) 2026 RNZALI. GPL-3.0-or-later.
 */
const fs = require('fs');
const path = require('path');
const C = require('./layout_common');
const { parts: P } = require('./layout_horizon');

/* the photo: 200x276 RGBA, cropped from the original at x 17-477, y 60-696 */
const FACE_W = 200, FACE_H = 276;
let facePx = null;
const face = () => {
    if (!facePx) {
        try { facePx = fs.readFileSync(path.join(__dirname, 'face_rnz.wad')); } catch (e) { facePx = Buffer.alloc(FACE_W * FACE_H * 4); }
    }
    return { key: 'face_rnz', w: FACE_W, h: FACE_H, px: facePx };
};
/* where things are in the photo (0..1): the mouth's line (centre x, y, half width, slope), the chin's foot and the
 * widest opening, the sunglasses' box (top, bottom, right) and the glint's period */
const MOUTH = [0.507, 0.558, 0.19, -0.031], JAW = [0.91, 0.11, 0, 0], GLASS = [0.157, 0.495, 0.84, 4.5];

/** How hard the car accelerates now, 0..1: the push (g), the engine's torque or the battery's power, the most;
 * under 8 % the mouth stays shut (idling, creeping). */
const pushOf = (d) => {
    const n = (v, full) => (C.isNum(v) ? v / full : 0);
    const p = Math.max(0, Math.min(1, Math.max(n(d.gLong, 0.3), n(d.torque, 350), n(d.kw, 70))));
    return p < 0.08 ? 0 : (p - 0.08) / 0.92;
};
/** 0..1 from 85 % of the red line up: the shake and the blush. */
const shakeOf = (o, d) => {
    const red = C.rpmScale(o).red * 1000;
    return C.isNum(d.rpm) ? Math.round(Math.max(0, Math.min(1, (d.rpm - red * 0.85) / (red * 0.15))) * 10) / 10 : 0;
};

/** The face over the rectangle (its height follows the photo's shape from its width). */
function facePiece(o, x, y, w) {
    const h = Math.round(w * FACE_H / FACE_W);
    return {
        key: 'face', kind: 'face', x, y, w, h, image: face(),
        params: { u_mouth: MOUTH, u_jaw: JAW, u_glass: GLASS },
        colors: () => ({ inside: '#2a0608', teeth: '#f2efe6', tongue: '#b8323c', blush: '#ff6a5a' }),
        value: pushOf, max: 1,
        dyn: (d) => ({ u_shake: [shakeOf(o, d)] }),
    };
}
/** The engine speed as a segmented bar, its red zone from the red line. */
const rpmBar = (o, x, y, w, h) => {
    const s = C.rpmScale(o);
    return Object.assign(C.bar('rpmBar', x, y, w, h, (d) => (C.isNum(d.rpm) ? d.rpm / 1000 / s.max : 0), P.bandColours, 24),
        { params: { u_geo: [4, h / 2, 0, Math.max(4, h - 8)], u_span: [0, 0, 24, 0.25], u_marks: [0, 0, 0, 0], u_red: [s.red / s.max] } });
};

module.exports = {
    id: 'face',
    title: 'RNZ Face',
    palette: (look) => P.PALETTES[look] || P.PALETTES.comfort,
    gearText: C.gearText,
    needs: [],

    pieces(o) {
        if (o.centre === 'map') {
            // the face left of the map, the speed and gear right of it, the ranges under it
            const bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat([
                facePiece(o, 70, 200, 300),
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
            // the face between the stock centre and the KOMBI's box, the gear under it
            return list.concat([
                facePiece(o, 1120, 150, 280),
                C.text('gear', 1120, 548, 140, 80, C.gearText, P.gearC),
                C.text('rpmDigits', 1262, 576, 140, 30, P.rpmTxt, P.lbl, { tracking: 0.1 }),
            ]);
        }
        // the face in the middle, under the camera's cowl and above the warning lights (an M car's boxes sit on it);
        // right of it, left of the KOMBI's box: the gear, the drive mode, the engine speed, the time and outside
        return list.concat([
            facePiece(o, 770, 128, 378),
            C.text('gear', 1168, 140, 232, 150, C.gearText, P.gearC),
            C.text('mode', 1168, 292, 232, 20, C.modeText, P.modeC, { tracking: 0.2 }),
            rpmBar(o, 1168, 456, 232, 24),
            C.text('rpmDigits', 1168, 490, 232, 36, P.rpmTxt, P.txt),
            C.text('rpmLbl', 1168, 530, 232, 16, 'RPM', P.lbl, { tracking: 0.3 }),
            C.text('clock', 1168, 574, 110, 30, C.clock, P.txt, { align: 0 }),
            C.text('outside', 1288, 574, 112, 30, (d) => C.outsideText(o, d.outside), P.txt, { align: 1 }),
        ]);
    },
};
