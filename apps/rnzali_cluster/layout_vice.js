'use strict';
/**
 * layout_vice.js - "Vice City / Bucharest Edition": Synthwave / GTA Vice City aesthetic inspired by Bucharest.
 *
 * Photorealistic artwork extracted from vn69nnn.webp:
 * - Center: Palatul Parlamentului (Palace of Parliament), Arcul de Triumf, Bucharest skyscrapers,
 *   helicopter, GTA VI logo, and wet asphalt street reflections with neon puddles (vice_bg.wad).
 * - Car: BMW rear silhouette with illuminated tail lights and license plate VN 69NNN (vice_car.wad).
 * - Dials: Left speed arc with chevron styling and dynamic speed digits; right RPM arc with redline.
 * - Badges: Bucharest neon script and palm tree badge.
 * - Bottom: Driving mode bar (ECO, COMFORT, SPORT, SPORT+).
 * - Top: Digital clock left, ambient temperature right.
 *
 * Copyright (C) 2026 RNZALI. GPL-3.0-or-later.
 */
const fs = require('fs');
const path = require('path');
const C = require('./layout_common');
const { parts: P } = require('./layout_horizon');

const BG_W = 960, BG_H = 360;
let bgPx = null;
const bgImg = () => {
    if (!bgPx) {
        try { bgPx = fs.readFileSync(path.join(__dirname, 'vice_bg.wad')); } catch (e) { bgPx = Buffer.alloc(BG_W * BG_H * 4); }
    }
    return { key: 'vice_bg', w: BG_W, h: BG_H, px: bgPx };
};

const CAR_W = 480, CAR_H = 340;
let carPx = null;
const carImg = () => {
    if (!carPx) {
        try { carPx = fs.readFileSync(path.join(__dirname, 'vice_car.wad')); } catch (e) { carPx = Buffer.alloc(CAR_W * CAR_H * 4); }
    }
    return { key: 'vice_car', w: CAR_W, h: CAR_H, px: carPx };
};

const PALETTES = {
    comfort: {
        bg: '#08020e',
        track: '#1b082e',
        fill0: '#00f0ff',
        fill1: '#ff007f',
        tip: '#ffffff',
        red: '#ff1443',
        tick: '#54206e',
        num: '#dca4ff',
        text: '#ffffff',
        glow: '#ff00aa',
        dim: '#9a70b8',
        ev: '#00f0ff',
        accent: '#ff00aa',
        rule: '#331045',
        mode: 'COMFORT',
        sky_top: '#18002b',
        sky_bot: '#6a0845',
        horizon: '#ff007f',
        city: '#28063d',
        car_body: '#140c24',
        car_light: '#ff1133',
        neon: '#00f0ff',
    },
    sport: {
        bg: '#0a0006',
        track: '#2a0515',
        fill0: '#ff3300',
        fill1: '#ff0066',
        tip: '#fff0e8',
        red: '#ff0022',
        tick: '#7a1835',
        num: '#ff9ebb',
        text: '#ffffff',
        glow: '#ff1144',
        dim: '#ba6075',
        ev: '#ff6600',
        accent: '#ff0044',
        rule: '#45081e',
        mode: 'SPORT',
        sky_top: '#24000d',
        sky_bot: '#780518',
        horizon: '#ff2200',
        city: '#330510',
        car_body: '#1f0910',
        car_light: '#ff0011',
        neon: '#ff3300',
    },
    efficient: {
        bg: '#000808',
        track: '#061c1c',
        fill0: '#00ffaa',
        fill1: '#00a6ff',
        tip: '#ebffff',
        red: '#ff2e43',
        tick: '#1a5454',
        num: '#88f0e0',
        text: '#f0ffff',
        glow: '#00ffc4',
        dim: '#5fa89c',
        ev: '#00ffaa',
        accent: '#00ffaa',
        rule: '#0e3636',
        mode: 'EFFICIENT',
        sky_top: '#001a1c',
        sky_bot: '#065054',
        horizon: '#00ffcc',
        city: '#04282b',
        car_body: '#081a1c',
        car_light: '#ff2244',
        neon: '#00ffc4',
    },
};

const bandColours = (t) => ({ track: t.track, fill0: t.fill0, fill1: t.fill1, redc: t.red, tip: t.tip, tick: t.tick, num: t.num });

const pushOf = (d) => {
    const n = (v, full) => (C.isNum(v) ? v / full : 0);
    const p = Math.max(0, Math.min(1, Math.max(n(d.gLong, 0.3), n(d.torque, 350), n(d.kw, 70))));
    return p < 0.08 ? 0 : (p - 0.08) / 0.92;
};

module.exports = {
    id: 'vice',
    title: 'GTA Vice City / Bucharest',
    palette: (look) => PALETTES[look] || PALETTES.comfort,
    gearText: C.gearText,
    needs: [],

    pieces(o) {
        if (o.centre === 'map') {
            const bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat([
                P.speedArc(o, 208, 380, 168, 14, 16),
                C.text('speedDigits', 98, 318, 220, 96, (d) => C.speedText(o, d), P.big),
                C.text('speedUnit', 98, 420, 220, 20, C.speedUnit(o), P.lbl, { tracking: 0.2 }),
                C.text('clock', 30, 560, 170, 30, C.clock, P.txt, { align: 0 }),
                C.text('outside', 216, 560, 170, 30, (d) => C.outsideText(o, d.outside), P.txt, { align: 1 }),
                C.text('gear', 1510, 130, 250, 96, C.gearText, P.gearC),
                C.text('mode', 1510, 230, 250, 20, C.modeText, P.modeC, { tracking: 0.2 }),
                P.rpmArc(o, 1745, 560, 100, 12, 13),
                C.text('rpmDigits', 1695, 540, 100, 26, P.rpmTxt, P.txt),
            ],
            C.readingUp('fuel', 440, bot + 2, 240, 30, (d) => C.distText(o, d.frange), 'FUEL RANGE', P.txt, P.lbl),
            C.readingUp('elec', 690, bot + 2, 260, 30, C.focus.both(o), C.focus.rangeLabel(o), C.engineFocus(o) ? P.txt : P.evTxt, P.lbl),
            C.readingUp('oilUp', 960, bot + 2, 160, 30, (d) => C.tempText(o, d.oil), 'OIL', P.hotC('oil', 130), P.lbl),
            C.readingUp('coolantUp', 1130, bot + 2, 160, 30, (d) => C.tempText(o, d.coolant), 'COOLANT', P.hotC('coolant', 118), P.lbl));
        }

        const stock = o.centre === 'stock';
        const list = [];
        const isCut = o.bottomStrip === 'stock';
        const bgH = isCut ? 660 : 720;
        const s = C.speedScale(o), r = C.rpmScale(o);

        if (stock) {
            list.push(
                C.flat('bg', 0, 0, 820, bgH, 'bg'),
                C.flat('bgR', 1100, 0, 820, bgH, 'bg')
            );
        } else {
            // Full Vice City twilight background with skyline & wet road
            list.push({
                key: 'bg', kind: 'viceBg', x: 0, y: 0, w: 1920, h: bgH,
                image: bgImg(),
            });
            // BMW rear silhouette (VN 69NNN) with reactive tail lights, turn signals & road smoke
            list.push({
                key: 'viceCar', kind: 'viceCar', x: 740, y: 310, w: 440, h: 310,
                image: carImg(), value: pushOf, max: 1,
                dyn: (d) => {
                    const push = pushOf(d);
                    const turn = C.isNum(d.turn) ? d.turn : 0;
                    const spd = C.isNum(d.speed) ? Math.min(1, C.speedIn(o, d.speed) / s.max) : 0;
                    return {
                        u_value: [push],
                        u_state: [push, turn, spd, 0.0],
                    };
                },
            });
            // GTA Vice City 6-Star Wanted Level display (open sky above Arcul de Triumf)
            list.push({
                key: 'viceWanted', kind: 'viceWanted', x: 1200, y: 110, w: 190, h: 26,
                value: (d) => (C.isNum(d.speed) ? C.speedIn(o, d.speed) / s.max : 0), max: 1,
            });
        }

        // Functional Outer Chevron Gauges:
        // Left Chevron: Dynamic Speedometer (0-330 km/h) with Electric Cyan -> Magenta fill & glowing tip cursor
        list.push({
            key: 'speed', kind: 'viceGauge', x: 0, y: 90, w: 340, h: 575,
            params: { u_span: [0, 0, 0, 0], u_red: [2.0] },
            colors: (t) => ({ fill0: t.fill0, fill1: t.fill1, redc: t.red, tip: t.tip }),
            value: (d) => (C.isNum(d.speed) ? C.speedIn(o, d.speed) / s.max : 0), max: 1, sweep: true,
        });

        // Speed readout inside left chevron well
        list.push(
            C.text('speedDigits', 280, 310, 240, 115, (d) => C.speedText(o, d), P.big),
            C.text('speedUnit', 280, 428, 240, 24, C.speedUnit(o), P.lbl, { tracking: 0.25 }),
            // Digital clock top left & ambient outside temperature top right
            C.text('clock', 280, 115, 140, 30, C.clock, P.txt, { align: 0 }),
            C.text('outside', 1500, 115, 140, 30, (d) => C.outsideText(o, d.outside), P.txt, { align: 1 })
        );

        // Temperatures (Oil & Coolant) under speed arc
        list.push(...P.temps(o, 60, 604, 220, 40));
        // Right column: fuel range, electric range, battery SOC
        list.push(...P.rightColumn(o));

        if (stock) {
            return list.concat([
                Object.assign(P.rpmArc(o, 1265, 400, 130, 14, 14), { colors: bandColours }),
                C.text('gear', 1190, 430, 150, 96, C.gearText, P.gearC),
                C.text('rpmDigits', 1190, 530, 150, 22, P.rpmTxt, P.lbl, { tracking: 0.1 }),
            ]);
        }

        // Right Chevron: Dynamic Tachometer (0-8000 RPM) with Blue -> Orange -> Redline fill & glowing tip cursor
        list.push(
            {
                key: 'rpmArc', kind: 'viceGauge', x: 1580, y: 90, w: 340, h: 575,
                params: { u_span: [1, 0, 0, 0], u_red: [r.red / r.max] },
                colors: (t) => ({ fill0: '#0077ff', fill1: '#ff6600', redc: t.red, tip: t.tip }),
                value: (d) => (C.isNum(d.rpm) ? d.rpm / 1000 / r.max : 0), max: 1, sweep: true,
            },
            C.text('gear', 1168, 140, 232, 80, C.gearText, P.gearC),
            C.text('mode', 1168, 224, 232, 20, C.modeText, P.modeC, { tracking: 0.25 }),
            C.text('readyLbl', 1168, 248, 232, 20, 'READY', (t) => ({ color: [t.accent, 0.9], glow: [t.glow, 0.4] }), { tracking: 0.2 }),
            C.text('rpmDigits', 1168, 574, 232, 26, P.rpmTxt, P.lbl, { tracking: 0.1 })
        );

        return list;
    },
};
