'use strict';
/**
 * layouts.js - the layouts RNZALI Cluster offers, by id. A layout is one file, layout_<id>.js, next to this one
 * (the build ships only top-level .js files); list it here and in app.json's "layout" setting (README.md).
 * The settings machinery below (M car, bottom strip, the frame behind the gear box) comes from Cluster Layouts by
 * eroobeeroo (GPL-3.0-or-later).
 */
const LAYOUTS = [require('./layout_horizon'), require('./layout_face'), require('./layout_manele')];
/* with Settings > Frame behind the gear box on: the bezel behind the KOMBI's gear bracket (layout_common.boxBezel),
 * just above the backgrounds. Off (the default) the box sits on the layout's own black background */
const { boxBezel, MAP, mCar } = require('./layout_common');

/*
 * Settings > Cluster: M car. An M car's KOMBI leaves two more dark boxes in the middle of the panel
 * (layout_common.M_HOLES, about x 778-1054 and 1208-1415, y 274-426), drawn over the layout. A layout either keeps
 * its readings out of them itself (Horizon does) or moves them here, by piece key and centre: { x, y, w, h }
 * replaced, dy / dx added, or squeeze: [x, w] (the piece and everything inside it narrowed into that span).
 * M_ON_DIAL: the pieces allowed under the boxes, a big arc, dial or picture that can't move out of the middle
 * (tools/clearance.js lists them; test_engine.js allows only these).
 */
const M_ON_DIAL = ['rpmArc', 'face', 'manBody', 'manHead'];
const M_MOVES = {};
function mMoves(L, o, list) {
    const m = (M_MOVES[L.id] || {})[o.centre || 'info'];
    if (!m) return list;
    // leave out first ('-key': kind), so a key two pieces share (a bar and its text) moves the one left
    let out = list.filter((p) => m['-' + p.key] !== p.kind);
    Object.keys(m).filter((k) => k[0] !== '-').forEach((k) => {
        const mv = m[k];
        const p = out.find((q) => q.key === k);
        if (!p) return;
        if (mv.squeeze) {
            const [nx, nw] = mv.squeeze, ox = p.x, ow = p.w, f = nw / ow;
            out = out.map((q) => (q === p || (q.x >= ox && q.x + q.w <= ox + ow && q.y >= p.y && q.y + q.h <= p.y + p.h && q.kind !== 'bg' && !/^bg/.test(q.key))
                ? Object.assign({}, q, { x: Math.round(nx + (q.x - ox) * f), w: Math.round(q.w * f) }) : q));
            return;
        }
        const n = Object.assign({}, p);
        ['x', 'y', 'w', 'h'].forEach((a) => { if (mv[a] !== undefined) n[a] = mv[a]; });
        if (mv.dy) n.y += mv.dy;
        if (mv.dx) n.x += mv.dx;
        out[out.indexOf(p)] = n;
    });
    return out;
}

/*
 * Settings > Layout: Stock bottom strip. The layout stops at CUT_Y (660, found on cars by thatgrayg22): the
 * background ends there, so the KOMBI's own bottom strip (gear, temperatures, fuel, warnings) shows under it, and
 * the dark boxes some cars' KOMBIs leave over a full-screen layout don't appear. Backgrounds are cut short; a
 * small piece that crosses the line moves up above it; one wholly below it is left out. Bigger pieces (the dials'
 * arcs, which are open at the bottom) stay as they are.
 */
const CUT_Y = 660;
const stripOn = (o) => !!o && o.bottomStrip === 'stock';
function bottomCut(list) {
    const out = [];
    list.forEach((p) => {
        if (p.y >= CUT_Y) return;
        if (p.y + p.h <= CUT_Y) return out.push(p);
        if (p.kind === 'flat' || p.kind === 'panel' || p.kind === 'flag' || /^bg/.test(p.key)) return out.push(Object.assign({}, p, { h: CUT_Y - p.y }));
        if (p.h <= 80) return out.push(Object.assign({}, p, { y: CUT_Y - p.h }));
        out.push(p);
    });
    return out;
}

LAYOUTS.forEach((L) => {
    const own = L.pieces;
    L.pieces = (o) => {
        let list = (own(o) || []).slice();
        if (mCar(o)) list = mMoves(L, o, list);
        if (stripOn(o)) list = bottomCut(list);
        if (!o || o.boxBezel !== true) return list;
        let i = 0;
        while (i < list.length && /^bg/.test(list[i].key)) i++;
        const b = boxBezel();
        // with the map: from the map's right edge (the map's own picture runs under the bracket's left end)
        if (o && o.centre === 'map') { const r = b.x + b.w; b.x = MAP.x + MAP.w; b.w = r - b.x; }
        list.splice(i, 0, b);
        return list;
    };
});
const byId = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
module.exports = { LAYOUTS, byId, M_MOVES, M_ON_DIAL, CUT_Y, bottomCut };
