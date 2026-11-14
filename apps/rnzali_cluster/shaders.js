'use strict';
/**
 * shaders.js - the GLSL ES 1.00 fragment shaders the instrument cluster runs to draw a layout.
 *
 * The cluster render service publishes a RAMSES scene; the KOMBI's own renderer subscribes to it and draws
 * it on the cluster's GPU. So nothing here is drawn on the head unit and no picture is sent: each piece of
 * a layout is an effect layer (one of these shaders over a rectangle), and what changes while driving is a
 * uniform (a needle's value: one number) or a few glyph codes. The only pixels ever sent are the glyph
 * atlas (font.js), once.
 *
 * Coordinates: v_uv runs 0..1 from the layer's top-left (the service's quad vertex shader); the shaders work
 * in the layer's pixels (u_size). Angles are degrees clockwise from 12 o'clock. The glyph atlas holds signed
 * distance fields (0.5 at the outline), so numerals stay sharp at any size and can glow.
 *
 * Kinds (engine.js makes the layers): FLAT a colour; PANEL a rounded card with a gradient and an edge; DIAL a
 * round dial with its needle; BAND a gauge along an arc of a circle (segmented or solid); TEXT a line of
 * glyphs.
 */

const HIGHP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

const COMMON = `
const float DEG = 0.017453293;
/* 1 inside a..b, with a pixel's soft edge */
float span(float x, float a, float b) { return clamp(x - a + 0.5, 0.0, 1.0) * clamp(b - x + 0.5, 0.0, 1.0); }
/* straight-alpha "over": c at coverage a over acc */
vec4 over(vec4 acc, vec3 c, float a) {
    float oa = a + acc.a * (1.0 - a);
    if (oa <= 0.0) return vec4(0.0);
    return vec4((c * a + acc.rgb * acc.a * (1.0 - a)) / oa, oa);
}
`;

/* Glyph lookup: code (cell) and a point in its box (g.x glyph heights from its centre line, g.y 0..1 from
 * the top) -> the distance field value, 0 outside the glyph's cell. */
const GLYPH = `
uniform sampler2D u_font;
uniform vec3 u_font_cells;        /* cells a row, a cell's width in glyph heights, rows */
float sdf(float code, vec2 g) {
    float u = 0.5 + g.x / u_font_cells.y;
    if (code < 0.0 || u < 0.0 || u > 1.0 || g.y < 0.0 || g.y > 1.0) return 0.0;
    float row = floor(code / u_font_cells.x + 0.001), col = code - row * u_font_cells.x;
    return texture2D(u_font, vec2((col + u) / u_font_cells.x, (row + g.y) / u_font_cells.z)).r;
}
/* a number's digit i (0 = leftmost) of n digits */
float digitOf(float v, float i, float n) {
    float p = n - 1.0 - i;
    float div = p < 0.5 ? 1.0 : p < 1.5 ? 10.0 : 100.0;
    return mod(floor(v / div + 0.001), 10.0);
}
`;

/** A flat colour over the layer. */
const FLAT_FS = `#version 100
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`;

/**
 * A rounded card of glass: a vertical gradient, a faint diagonal sheen, a light along its top edge, a border
 * brighter at the top than the bottom, and a soft shadow inside its lower edge.
 *   u_box     corner radius, border width, top light (0..1), opacity
 */
const PANEL_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform vec4 u_box;
uniform vec3 u_top;
uniform vec3 u_bottom;
uniform vec3 u_border;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size, h = u_size * 0.5, q = abs(p - h) - (h - u_box.x);
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_box.x;   /* < 0 inside */
    float inside = clamp(0.5 - dist, 0.0, 1.0);
    if (inside <= 0.0) { gl_FragColor = vec4(0.0); return; }
    vec3 col = mix(u_top, u_bottom, v_uv.y);
    col += vec3(1.0) * 0.022 * u_box.z * smoothstep(0.55, 0.0, abs(v_uv.x - v_uv.y * 0.6 - 0.15));
    col += u_border * u_box.z * 0.45 * clamp(1.0 - p.y / 22.0, 0.0, 1.0);
    col *= 1.0 - 0.25 * u_box.z * smoothstep(0.75, 1.0, v_uv.y);
    vec3 edge = mix(u_border * 1.7, u_border * 0.6, v_uv.y);
    col = mix(col, edge, clamp(dist + u_box.y + 0.5, 0.0, 1.0) * (u_box.y > 0.0 ? 1.0 : 0.0));
    gl_FragColor = vec4(col, inside * u_box.w);
}`;

/**
 * A round dial with its needle, all in one square quad: the face (shaded, with depth near the rim), a
 * metal bezel, an optional value arc (a lit band from the start to the needle), the red zone, minor and
 * major ticks, numerals at the major ticks (digits from the atlas), a backlight glow round the markings, the
 * needle with its shadow and glow, the hub and a faint glass reflection.
 *   u_scale   max, major step, minor step, red zone start (>= max: none)
 *   u_arc     start and end angle, numeral height px (0: none), numeral radius px
 *   u_needle_dim  length, tail, width at the hub, width at the tip (px)
 *   u_look    backlight glow 0..1, metal 0..1, value arc 0/1, value arc radius (px from the face's edge in)
 *   u_look2   bezel width px, size scale (1 for a 640 px dial: ticks and hub scale with it), needle
 *             shadow 0..1, glass 0..1
 *   u_value   the reading on the scale
 */
const DIAL_FS = `#version 100
${HIGHP}${COMMON}${GLYPH}
uniform vec2 u_size;
uniform vec4 u_scale;
uniform vec4 u_arc;
uniform vec4 u_needle_dim;
uniform vec4 u_look;
uniform vec4 u_look2;
uniform float u_value;
uniform float u_digit_adv;
uniform vec3 u_face0;
uniform vec3 u_face1;
uniform vec3 u_bezel;
uniform vec3 u_bezel2;
uniform vec3 u_tick;
uniform vec3 u_minor;
uniform vec3 u_num;
uniform vec3 u_red;
uniform vec3 u_needle;
uniform vec3 u_hub;
uniform vec3 u_accent;
uniform vec3 u_glow;
varying vec2 v_uv;

float angleOf(float v) { return mix(u_arc.x, u_arc.y, clamp(v / u_scale.x, 0.0, 1.0)); }
/* a radial tick at value v: r0..r1, half width hw; soft adds a glow falloff that wide */
float tick(float v, float ang, float r, float r0, float r1, float hw, float soft) {
    float off = abs(ang - angleOf(v)) * DEG * r;
    float a = soft > 0.0 ? clamp((hw + soft - off) / soft, 0.0, 1.0) : clamp(hw - off + 0.5, 0.0, 1.0);
    return a * span(r, r0 - soft, r1 + soft);
}
/* the needle's blade at offset d from the pivot: coverage (soft: a blurred edge that wide) */
float blade(vec2 d, float soft) {
    float na = angleOf(u_value) * DEG;
    vec2 dir = vec2(sin(na), -cos(na)), perp = vec2(cos(na), sin(na));
    float along = dot(d, dir), side = abs(dot(d, perp));
    float len = u_needle_dim.x, tail = u_needle_dim.y;
    float hw = along >= 0.0 ? mix(u_needle_dim.z, u_needle_dim.w, clamp(along / len, 0.0, 1.0)) * 0.5 : u_needle_dim.z * 0.5;
    float s = max(soft, 0.5);
    return clamp((hw - side) / s + 0.5, 0.0, 1.0) * clamp((along + tail) / s + 0.5, 0.0, 1.0) * clamp((len - along) / s + 0.5, 0.0, 1.0);
}

void main() {
    vec2 d = (v_uv - 0.5) * u_size;
    float r = length(d);
    float k = u_look2.y;
    float Ro = u_size.x * 0.5 - 2.0, bw = u_look2.x, R = Ro - bw;
    float disc = clamp(Ro - r + 0.5, 0.0, 1.0);
    if (disc <= 0.0) { gl_FragColor = vec4(0.0); return; }
    float ang = atan(d.x, -d.y) / DEG;
    float a0 = min(u_arc.x, u_arc.y), a1 = max(u_arc.x, u_arc.y);

    /* the face: lighter in the middle, deeper towards the rim, fine machined rings */
    float f = r / R;
    vec3 col = mix(u_face0, u_face1, smoothstep(0.15, 1.0, f));
    col *= 1.0 - 0.38 * smoothstep(0.78, 1.0, f);
    col *= 1.0 + 0.018 * sin(r * 2.1);

    float v = (clamp(ang, a0, a1) - u_arc.x) / (u_arc.y - u_arc.x) * u_scale.x;
    bool inArc = ang >= a0 - 3.0 && ang <= a1 + 3.0;
    /* the value arc: a lit band from the start to the reading, brighter towards the needle */
    if (u_look.z > 0.5 && inArc) {
        float rr0 = R - u_look.w - 8.0 * k, rr1 = R - u_look.w;
        float frac = clamp(v / max(u_value, 0.001), 0.0, 1.0);
        float lit = (v <= u_value ? 1.0 : 0.0) * span(r, rr0, rr1);
        col = mix(col, u_minor * 0.35, span(r, rr0, rr1) * 0.5);
        col = mix(col, u_accent * (0.45 + 0.55 * frac), lit);
        col += u_accent * 0.25 * (v <= u_value ? 1.0 : 0.0) * clamp(1.0 - abs(r - (rr0 + rr1) * 0.5) / (14.0 * k), 0.0, 1.0) * frac;
    }
    if (inArc) {
        float vm = clamp(floor(v / u_scale.z + 0.5) * u_scale.z, 0.0, u_scale.x);
        float vM = clamp(floor(v / u_scale.y + 0.5) * u_scale.y, 0.0, u_scale.x);
        /* the red zone */
        if (u_scale.w < u_scale.x) {
            float zone = clamp((v - u_scale.w) / u_scale.x * (a1 - a0) * DEG * r + 0.5, 0.0, 1.0);
            col = mix(col, u_red, zone * span(r, R - 34.0 * k, R - 14.0 * k));
        }
        /* backlight round the ticks */
        float gl = max(tick(vM, ang, r, R - 46.0 * k, R - 14.0 * k, 3.0 * k, 7.0 * k), tick(vm, ang, r, R - 30.0 * k, R - 14.0 * k, 1.5 * k, 5.0 * k) * 0.6);
        col += u_glow * gl * u_look.x * 0.35;
        col = mix(col, u_minor, tick(vm, ang, r, R - 30.0 * k, R - 14.0 * k, 1.4 * k, 0.0));
        col = mix(col, vM >= u_scale.w - 0.001 && u_scale.w < u_scale.x ? u_red : u_tick, tick(vM, ang, r, R - 46.0 * k, R - 14.0 * k, 3.0 * k, 0.0));
    }
    /* the numerals, upright, at the nearest major tick, with their backlight */
    if (u_arc.z > 0.0) {
        float vk = clamp(floor(v / u_scale.y + 0.5) * u_scale.y, 0.0, u_scale.x);
        float ak = angleOf(vk) * DEG;
        vec2 pc = vec2(sin(ak), -cos(ak)) * u_arc.w;
        float h = u_arc.z, adv = u_digit_adv;
        float n = vk >= 99.5 ? 3.0 : vk >= 9.5 ? 2.0 : 1.0;
        vec2 q = (d - pc) / h;
        float x = q.x + n * adv * 0.5;
        float i = floor(x / adv);
        if (i >= 0.0 && i < n) {
            float s = sdf(digitOf(vk, i, n), vec2(x - (i + 0.5) * adv, q.y + 0.5));
            float ink = smoothstep(0.5 - 2.0 / h, 0.5 + 2.0 / h, s);
            float halo = smoothstep(0.22, 0.5, s) * (1.0 - ink);
            bool red = vk >= u_scale.w - 0.001 && u_scale.w < u_scale.x;
            col += (red ? u_red : u_glow) * halo * u_look.x * 0.55;
            col = mix(col, red ? u_red : u_num, ink);
        }
    }
    /* the needle: its shadow on the face, a glow, the blade (the tail darker) */
    {
        float sh = blade(d - vec2(5.0, 8.0) * k, 7.0 * k);
        col *= 1.0 - 0.55 * sh * u_look2.z;
        float na = angleOf(u_value) * DEG;
        float along = dot(d, vec2(sin(na), -cos(na)));
        col += u_needle * 0.45 * blade(d, 6.0 * k) * (along > 0.0 ? 1.0 : 0.3);
        float b = blade(d, 0.0);
        vec3 nc = along >= 0.0 ? mix(u_needle * 0.8, u_needle * 1.15, clamp(along / u_needle_dim.x, 0.0, 1.0)) : u_needle * 0.35;
        col = mix(col, nc, b);
    }
    /* the hub: a metal cap, lit from the top left */
    {
        float hr = 34.0 * k;
        float lit = 0.5 + 0.5 * dot(d / max(r, 1.0), vec2(-0.6, -0.8));
        col = mix(col, mix(u_bezel2, u_bezel, lit * 0.8 + 0.1), clamp(hr - r + 0.5, 0.0, 1.0));
        col = mix(col, mix(u_hub, u_hub * 1.6, (1.0 - r / hr) * 0.6), clamp(hr * 0.78 - r + 0.5, 0.0, 1.0));
    }
    /* the bezel: a metal ring, its light following the angle (brushed), a bevel across it */
    if (r > R - 1.0) {
        float t = clamp((r - R) / bw, 0.0, 1.0);
        float sheen = 0.5 + 0.5 * cos(2.0 * (ang + 40.0) * DEG);
        float bevel = sin(t * 3.14159);
        vec3 m = mix(u_bezel2, u_bezel, clamp(sheen * u_look.y + bevel * 0.35 + (1.0 - u_look.y) * 0.6, 0.0, 1.0));
        m *= 0.85 + 0.15 * (1.0 - t);
        col = mix(col, m, clamp(r - R + 0.5, 0.0, 1.0));
        col = mix(col, u_bezel2 * 0.4, span(r, R - 2.0, R));          /* the dark seam inside it */
    }
    /* glass: a faint reflection across the upper left of the face */
    col += vec3(1.0) * u_look2.w * 0.05 * smoothstep(0.1, 0.7, dot(d / R, vec2(-0.55, -0.83))) * clamp(R - r, 0.0, 1.0);
    gl_FragColor = vec4(col, disc);
}`;

/**
 * A gauge along an arc of a circle: a track, the fill from the start to u_value (0..1) in a gradient, red
 * from u_red, a glowing tip, ticks and numerals outside it. Transparent elsewhere.
 *   u_geo     the circle's centre (px in this layer, may be outside it), radius, the band's thickness; radius 0:
 *             a straight bar instead (x: its inset from each end, y: its centre line, w: its thickness;
 *             u_span.x < 0: filled from the right)
 *   u_span    start and end angle, segments (0: solid), gap (of a segment)
 *   u_marks   major marks (0: none), numeral step (the value at each mark), numeral height px (0: none),
 *             numeral distance px from the band's centre line (- inside, + outside)
 */
const BAND_FS = `#version 100
${HIGHP}${COMMON}${GLYPH}
uniform vec2 u_size;
uniform vec4 u_geo;
uniform vec4 u_span;
uniform vec4 u_marks;
uniform float u_value;
uniform float u_red;
uniform float u_soft;              /* 0: glows as drawn, 1: none (a quieter look) */
uniform float u_digit_adv;
uniform vec3 u_track;
uniform vec3 u_fill0;
uniform vec3 u_fill1;
uniform vec3 u_redc;
uniform vec3 u_tip;
uniform vec3 u_tick;
uniform vec3 u_num;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size;
    if (u_geo.z <= 0.0) {
        /* a straight capsule along x: inset u_geo.x each end, u_geo.w thick, centred on y u_geo.y; filled with a
         * gradient to u_value, a glow round the fill, a marker at u_red (from there the fill turns red);
         * segmented when u_span.z > 0; filled from the right when u_span.x < 0 */
        float x0 = u_geo.x, len = u_size.x - 2.0 * u_geo.x, T = u_geo.w, r = T * 0.5;
        float t = (p.x - x0) / len;
        if (u_span.x < 0.0) t = 1.0 - t;
        float cx = clamp(p.x, x0 + r, x0 + len - r);
        float dist = length(vec2(p.x - cx, p.y - u_geo.y)) - r;            /* < 0 inside the capsule */
        vec4 acc = vec4(0.0);
        float v = clamp(u_value, 0.0, 1.0);
        float fx = u_span.x < 0.0 ? x0 + len * (1.0 - v) : x0 + len * v;   /* the fill's edge */
        float lit = u_span.x < 0.0 ? clamp(p.x - fx + 0.5, 0.0, 1.0) : clamp(fx - p.x + 0.5, 0.0, 1.0);
        vec3 fc = mix(u_fill0, u_fill1, clamp(t / max(v, 0.001), 0.0, 1.0));
        if (t >= u_red) fc = u_redc;
        /* the glow round the fill, under everything */
        float gl = exp(-max(dist, 0.0) * max(dist, 0.0) / (T * T * 0.6)) * (dist > 0.0 ? 1.0 : 0.0) * lit;
        acc = over(acc, fc, gl * 0.35 * (1.0 - u_soft) * (v > 0.003 ? 1.0 : 0.0));
        float seg = 1.0;
        if (u_span.z > 0.0) { float sl = len / u_span.z, sx = fract(t * u_span.z) * sl, g = sl * u_span.w * 0.5; seg = span(sx, g, sl - g); }
        float body = clamp(0.5 - dist, 0.0, 1.0) * seg;
        float across = clamp(1.0 - abs(p.y - u_geo.y) / r, 0.0, 1.0);
        acc = over(acc, u_track * (0.85 + 0.3 * across), body);
        acc = over(acc, fc * (0.8 + 0.35 * across), body * lit * (v > 0.003 ? 1.0 : 0.0));
        /* the warning marker */
        if (u_red < 1.0) {
            float mx = u_span.x < 0.0 ? x0 + len * (1.0 - u_red) : x0 + len * u_red;
            acc = over(acc, u_redc, clamp(1.2 - abs(p.x - mx) + 0.5, 0.0, 1.0) * span(p.y, u_geo.y - r - 3.0, u_geo.y + r + 3.0));
        }
        float dt = length(p - vec2(fx, u_geo.y));
        acc = over(acc, u_tip, exp(-dt * dt / (T * T * 0.7)) * 0.75 * (1.0 - u_soft) * (v > 0.003 ? 1.0 : 0.0));
        gl_FragColor = acc;
        return;
    }
    vec2 d = p - u_geo.xy;
    float r = length(d), R = u_geo.z, T = u_geo.w;
    float ang = atan(d.x, -d.y) / DEG;
    float a0 = u_span.x, a1 = u_span.y, sweep = a1 - a0;
    /* angle relative to the start, unwrapped towards the sweep */
    float da = ang - a0;
    if (sweep > 0.0 && da < -180.0) da += 360.0;
    if (sweep > 0.0 && da > 180.0 + sweep) da -= 360.0;
    if (sweep < 0.0 && da > 180.0) da -= 360.0;
    if (sweep < 0.0 && da < -180.0 + sweep) da += 360.0;
    float t = da / sweep;
    float lenPx = abs(sweep) * DEG * r;
    vec4 acc = vec4(0.0);

    float inBand = span(r, R - T * 0.5, R + T * 0.5) * span(t * lenPx, 0.0, lenPx);
    {
        /* a soft glow round the lit part, under the band */
        float outside = abs(r - R) - T * 0.5;
        vec3 hc = t >= u_red ? u_redc : mix(u_fill0, u_fill1, clamp(t / max(u_value, 0.001), 0.0, 1.0));
        float halo = outside > 0.0 ? exp(-outside * outside / (T * T * 0.35)) : 0.0;
        acc = over(acc, hc, halo * 0.32 * (1.0 - u_soft) * clamp((u_value - t) * lenPx + 0.5, 0.0, 1.0) * span(t * lenPx, 0.0, lenPx) * (u_value > 0.003 ? 1.0 : 0.0));
    }
    if (inBand > 0.0) {
        float seg = 1.0;
        if (u_span.z > 0.0) {
            float sl = lenPx / u_span.z, sx = fract(t * u_span.z) * sl, g = sl * u_span.w * 0.5;
            seg = span(sx, g, sl - g);
        }
        float lit = clamp((u_value - t) * lenPx + 0.5, 0.0, 1.0);
        vec3 fc = mix(u_fill0, u_fill1, clamp(t / max(u_value, 0.001), 0.0, 1.0));
        if (t >= u_red) fc = u_redc;
        /* across the band: brighter at its middle */
        float across = 1.0 - abs(r - R) / (T * 0.5);
        vec3 c = mix(u_track * (t >= u_red ? 1.6 : 1.0), fc * (0.75 + 0.35 * across), lit);
        acc = over(acc, c, inBand * seg);
    }
    /* the tip's glow */
    {
        float ta = (a0 + sweep * clamp(u_value, 0.0, 1.0)) * DEG;
        vec2 tp = u_geo.xy + vec2(sin(ta), -cos(ta)) * R;
        float dist = length(p - tp);
        float g = exp(-dist * dist / (T * T * 0.9)) * (u_value > 0.003 ? 1.0 : 0.0);
        acc = over(acc, u_tip, g * 0.85 * (1.0 - u_soft * 0.8));
    }
    /* major marks outside the band, numerals beside them */
    if (u_marks.x > 0.0) {
        float m = floor(clamp(t, 0.0, 1.0) * u_marks.x + 0.5);
        float tm = m / u_marks.x;
        float off = abs(t - tm) * lenPx;
        float r0 = R + T * 0.5 + 4.0, r1 = R + T * 0.5 + 14.0;
        if (u_marks.w < 0.0) { r0 = R - T * 0.5 - 14.0; r1 = R - T * 0.5 - 4.0; }
        acc = over(acc, u_tick, clamp(1.6 - off + 0.5, 0.0, 1.0) * span(r, r0, r1));
        if (u_marks.z > 0.0) {
            float vk = m * u_marks.y;
            float am = (a0 + sweep * tm) * DEG;
            vec2 pc = u_geo.xy + vec2(sin(am), -cos(am)) * (R + u_marks.w);
            float h = u_marks.z, adv = u_digit_adv;
            float n = vk >= 99.5 ? 3.0 : vk >= 9.5 ? 2.0 : 1.0;
            vec2 q = (p - pc) / h;
            float x = q.x + n * adv * 0.5;
            float i = floor(x / adv);
            if (i >= 0.0 && i < n) {
                float s = sdf(digitOf(vk, i, n), vec2(x - (i + 0.5) * adv, q.y + 0.5));
                acc = over(acc, tm >= u_red ? u_redc : u_num, smoothstep(0.5 - 2.0 / h, 0.5 + 2.0 / h, s));
            }
        }
    }
    gl_FragColor = acc;
}`;

/**
 * A line of up to 32 glyphs, the height of the layer, in u_color, with an optional glow (u_glow: colour,
 * strength 0..1): their codes (u_text) and centres (u_x) come from font.js line(), so each glyph keeps its
 * own width.
 */
const TEXT_FS = `#version 100
${HIGHP}${GLYPH}
uniform vec2 u_size;
uniform vec4 u_text[8];           /* glyph codes, 4 to a vec4, -1 none (up to 32) */
uniform vec4 u_x[8];              /* each glyph's centre, glyph heights from the left (font.js line) */
uniform vec4 u_color;
uniform vec4 u_glow;
varying vec2 v_uv;
void main() {
    float h = u_size.y;
    float x = v_uv.x * u_size.x / h;
    /* the two glyphs whose centres are nearest, the more inked of them: a wide letter beside a narrow one
       (the m of 'mi') reaches past the half-way point between their centres */
    float best = 1e4, code = -1.0, cx = 0.0, best2 = 1e4, code2 = -1.0, cx2 = 0.0;
    for (int i = 0; i < 8; i++) {
        vec4 c = u_x[i], k = u_text[i];
        for (int j = 0; j < 4; j++) {
            float cj = j == 0 ? c.x : j == 1 ? c.y : j == 2 ? c.z : c.w;
            float kj = j == 0 ? k.x : j == 1 ? k.y : j == 2 ? k.z : k.w;
            float dj = abs(x - cj);
            if (dj < best) { best2 = best; code2 = code; cx2 = cx; best = dj; code = kj; cx = cj; }
            else if (dj < best2) { best2 = dj; code2 = kj; cx2 = cj; }
        }
    }
    float s = max(sdf(code, vec2(x - cx, v_uv.y)), sdf(code2, vec2(x - cx2, v_uv.y)));
    float ink = smoothstep(0.5 - 2.0 / h, 0.5 + 2.0 / h, s);
    float halo = smoothstep(0.18, 0.5, s) * (1.0 - ink) * u_glow.a;
    float a = ink * u_color.a + halo * 0.7;
    vec3 c = a > 0.0 ? (u_color.rgb * ink * u_color.a + u_glow.rgb * halo * 0.7) / a : u_color.rgb;
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
}`;


/**
 * The centre's background: a vertical gradient, a soft glow of the accent colour behind the top, a faint grid
 * of dots and a vignette.
 *   u_look    accent glow 0..1, dots 0..1, vignette 0..1, dot spacing px
 */
const BG_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform vec4 u_look;
uniform float u_feather;           /* px at the left and right edges fading to see-through */
uniform vec3 u_top;
uniform vec3 u_bottom;
uniform vec3 u_accent;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size;
    vec3 col = mix(u_top, u_bottom, v_uv.y);
    vec2 g = (p - vec2(u_size.x * 0.5, 40.0)) / vec2(u_size.x * 0.32, 120.0);
    col += u_accent * u_look.x * 0.16 * exp(-dot(g, g));
    vec2 c = fract(p / u_look.w) - 0.5;
    col += vec3(1.0) * u_look.y * 0.035 * clamp(1.6 - length(c) * u_look.w, 0.0, 1.0);
    vec2 v = (v_uv - 0.5) * vec2(1.0, 1.4);
    col *= 1.0 - u_look.z * 0.55 * smoothstep(0.35, 0.8, length(v));
    float a = u_feather > 0.0 ? smoothstep(0.0, u_feather, min(p.x, u_size.x - p.x)) : 1.0;
    gl_FragColor = vec4(col, a);
}`;

/**
 * A small icon, drawn from shapes: u_icon picks it (0 thermometer, 1 oil drop, 2 gear, 3 air, 4 fuel pump,
 * 5 turbo, 6 battery, 7 bolt, 8 steering wheel, 9 stopwatch, 10 car, 11 engine, 12 snowflake, 13 gauge).
 */
const ICON_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform float u_icon;
uniform float u_line;              /* 0: filled; > 0: outlined, this many px wide */
uniform vec4 u_color;
varying vec2 v_uv;
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float seg(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float ring(vec2 p, float r, float w) { return abs(length(p) - r) - w; }
void main() {
    vec2 p = (v_uv - 0.5) * 2.0;
    p.y = -p.y;                                   /* y up, -1..1 */
    float px = 2.0 / u_size.y, d = 1e3, id = floor(u_icon + 0.5);
    if (id < 0.5) { d = min(length(p - vec2(0.0, -0.55)) - 0.3, seg(p, vec2(0.0, -0.4), vec2(0.0, 0.7), 0.13)); d = max(d, -seg(p, vec2(0.0, -0.1), vec2(0.0, 0.62), 0.04)); }
    else if (id < 1.5) { vec2 q = p - vec2(0.0, -0.22); d = max(length(q) - 0.52, -(q.y - 0.0) - 1.0); d = min(d, max(abs(p.x) * 1.35 + (p.y - 0.85) * 0.75, -p.y + 0.0)); }
    else if (id < 2.5) { float a = atan(p.y, p.x), r = length(p); float tooth = step(0.5, fract(a / 6.2832 * 8.0)); d = max(r - 0.62 - 0.2 * tooth, -(r - 0.24)); }
    else if (id < 3.5) { d = min(min(seg(p, vec2(-0.8, 0.4), vec2(0.5, 0.4), 0.09), seg(p, vec2(-0.8, 0.0), vec2(0.8, 0.0), 0.09)), seg(p, vec2(-0.8, -0.4), vec2(0.3, -0.4), 0.09)); d = min(d, ring(p - vec2(0.5, 0.6), 0.2, 0.09) + step(0.6, p.y) * 0.0); }
    else if (id < 4.5) { d = min(box(p - vec2(-0.2, -0.05), vec2(0.42, 0.8), 0.1), seg(p, vec2(0.25, 0.3), vec2(0.7, 0.0), 0.08)); d = min(d, seg(p, vec2(0.7, 0.0), vec2(0.7, -0.6), 0.08)); d = max(d, -box(p - vec2(-0.2, 0.35), vec2(0.24, 0.2), 0.04)); }
    else if (id < 5.5) { float a = atan(p.y, p.x), r = length(p); float sp = fract((a / 6.2832) * 3.0 + r * 0.9); d = max(r - 0.85, -(r - 0.18)); d = max(d, -(abs(sp - 0.5) - 0.32) * r * 2.0); d = min(d, ring(p, 0.85, 0.07)); }
    else if (id < 6.5) { d = min(ring(vec2(box(p, vec2(0.85, 0.5), 0.12), 0.0), 0.0, 0.08), box(p - vec2(0.93, 0.0), vec2(0.07, 0.2), 0.03)); d = min(d, box(p - vec2(-0.3, 0.0), vec2(0.4, 0.3), 0.05)); }
    else if (id < 7.5) { vec2 a = vec2(0.15, 0.95), b = vec2(-0.45, -0.05), c = vec2(0.05, -0.05), e = vec2(-0.15, -0.95), f = vec2(0.45, 0.05), g = vec2(-0.05, 0.05);
        d = min(min(seg(p, a, b, 0.09), seg(p, b, f, 0.09)), seg(p, f, e, 0.09)); d = min(d, seg(p, c, g, 0.09)); }
    else if (id < 8.5) { d = min(ring(p, 0.78, 0.1), length(p) - 0.2); d = min(d, min(seg(p, vec2(-0.75, 0.05), vec2(0.75, 0.05), 0.08), seg(p, vec2(0.0, 0.0), vec2(0.0, -0.75), 0.08))); }
    else if (id < 9.5) { d = min(ring(p - vec2(0.0, -0.1), 0.72, 0.1), box(p - vec2(0.0, 0.85), vec2(0.18, 0.08), 0.03)); d = min(d, seg(p, vec2(0.0, -0.1), vec2(0.3, 0.25), 0.08)); }
    else if (id < 10.5) { d = min(box(p - vec2(0.0, -0.05), vec2(0.9, 0.32), 0.18), box(p - vec2(0.05, 0.35), vec2(0.5, 0.25), 0.14)); d = max(d, -min(length(p - vec2(-0.5, -0.4)) - 0.22, length(p - vec2(0.5, -0.4)) - 0.22)); d = min(d, min(ring(p - vec2(-0.5, -0.4), 0.16, 0.06), ring(p - vec2(0.5, -0.4), 0.16, 0.06))); }
    else if (id < 11.5) { d = min(box(p, vec2(0.6, 0.42), 0.08), box(p - vec2(0.0, 0.55), vec2(0.3, 0.1), 0.03)); d = min(d, min(box(p - vec2(-0.75, 0.0), vec2(0.12, 0.2), 0.03), box(p - vec2(0.75, 0.1), vec2(0.12, 0.25), 0.03))); d = max(d, -box(p - vec2(0.0, 0.0), vec2(0.35, 0.18), 0.04)); }
    else if (id < 12.5) { float a = atan(p.y, p.x); float k = mod(a + 0.2618, 1.0472) - 0.5236; vec2 q = length(p) * vec2(cos(k), sin(k)); d = seg(q, vec2(0.0), vec2(0.85, 0.0), 0.08); d = min(d, seg(q, vec2(0.55, 0.0), vec2(0.75, 0.2), 0.06)); }
    else { d = max(ring(p - vec2(0.0, -0.15), 0.8, 0.1), -(p.y + 0.35)); d = min(d, seg(p, vec2(0.0, -0.15), vec2(0.45, 0.35), 0.08)); d = min(d, length(p - vec2(0.0, -0.15)) - 0.14); }
    float a = u_line > 0.0 ? clamp(0.5 - (abs(d) - u_line * px * 0.5) / px, 0.0, 1.0) : clamp(0.5 - d / px, 0.0, 1.0);
    gl_FragColor = vec4(u_color.rgb, u_color.a * a);
}`;

/**
 * A trend line: up to 64 samples (u_hist, 0..1 each, -1 none, oldest first; u_count of them), drawn across
 * the layer with a glow and the area under it filled, the last sample marked.
 */
const SPARK_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform vec4 u_hist[16];
uniform float u_count;
uniform vec3 u_line;
uniform vec3 u_fill;
varying vec2 v_uv;
float sampleAt(float i) {
    float slot = floor(i / 4.0), lane = i - slot * 4.0;
    vec4 v = u_hist[0];
    for (int k = 1; k < 16; k++) if (float(k) == slot) v = u_hist[k];
    return lane < 0.5 ? v.x : lane < 1.5 ? v.y : lane < 2.5 ? v.z : v.w;
}
void main() {
    if (u_count < 2.0) { gl_FragColor = vec4(0.0); return; }
    vec2 p = v_uv * u_size;
    float pad = 4.0, h = u_size.y - 2.0 * pad;
    float f = clamp(v_uv.x, 0.0, 1.0) * (u_count - 1.0), i = floor(f);
    float a = sampleAt(i), b = sampleAt(min(i + 1.0, u_count - 1.0));
    if (a < 0.0 || b < 0.0) { gl_FragColor = vec4(0.0); return; }
    float yv = pad + h * (1.0 - mix(a, b, f - i));
    float slope = (b - a) * h / (u_size.x / (u_count - 1.0));
    float dist = abs(p.y - yv) / sqrt(1.0 + slope * slope);
    vec4 acc = vec4(0.0);
    acc = over(acc, u_fill, (p.y > yv ? 1.0 : 0.0) * 0.28 * (1.0 - (p.y - yv) / max(1.0, u_size.y - yv)));
    acc = over(acc, u_line, exp(-dist * dist / 18.0) * 0.35);
    acc = over(acc, u_line, clamp(1.4 - dist, 0.0, 1.0));
    float last = sampleAt(u_count - 1.0);
    float dl = length(p - vec2(u_size.x - 1.0, pad + h * (1.0 - last)));
    acc = over(acc, u_line, clamp(3.5 - dl, 0.0, 1.0));
    gl_FragColor = acc;
}`;

/**
 * The car from above for the xDrive split: body, glasshouse, wheels, the axles lit by their share and the
 * torque flowing from the gearbox to each axle (chevrons moving at a speed set by the share, on the
 * renderer's clock: nothing is sent to move them).
 *   u_value   the rear share 0..1 (u_valid 0: no data, nothing lit)
 */
const CAR_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform highp float u_time;
uniform float u_value;
uniform float u_valid;
uniform vec3 u_body;
uniform vec3 u_edge;
uniform vec3 u_accent;
uniform vec3 u_wheel;
varying vec2 v_uv;
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
    vec2 p = (v_uv - 0.5) * u_size;               /* px from the centre, y down (front at the top) */
    float W = u_size.x, H = u_size.y;
    float rear = clamp(u_value, 0.0, 1.0) * u_valid, front = (1.0 - clamp(u_value, 0.0, 1.0)) * u_valid;
    vec4 acc = vec4(0.0);
    float fy = -H * 0.30, ry = H * 0.30, track = W * 0.30;
    /* the axles, lit by their share, with a glow */
    float fa = box(p - vec2(0.0, fy), vec2(track, 5.0), 5.0), ra = box(p - vec2(0.0, ry), vec2(track, 5.0), 5.0);
    acc = over(acc, u_accent, exp(-max(fa, 0.0) * max(fa, 0.0) / 120.0) * front * 0.6);
    acc = over(acc, u_accent, exp(-max(ra, 0.0) * max(ra, 0.0) / 120.0) * rear * 0.6);
    /* the body: wider at the back, rounded at both ends */
    float taper = mix(0.86, 1.0, clamp((p.y + H * 0.45) / (H * 0.9), 0.0, 1.0));
    float bd = box(vec2(p.x / taper, p.y), vec2(W * 0.24, H * 0.46), W * 0.12);
    acc = over(acc, mix(u_body * 1.25, u_body * 0.75, v_uv.y), clamp(0.5 - bd, 0.0, 1.0));
    acc = over(acc, u_edge, clamp(1.6 - abs(bd), 0.0, 1.0) * 0.9);
    /* the glasshouse */
    float gd = box(p - vec2(0.0, H * 0.02), vec2(W * 0.17, H * 0.2), W * 0.07);
    acc = over(acc, mix(u_edge * 0.55, u_body * 0.6, v_uv.y), clamp(0.5 - gd, 0.0, 1.0) * 0.9);
    /* the drive shaft and the torque flowing out of the gearbox (just behind the front axle) to each axle */
    float gy = fy + H * 0.12;
    float shaft = abs(p.x) - 3.0;
    if (shaft < 6.0) {
        float toFront = p.y < gy ? 1.0 : 0.0, share = toFront > 0.5 ? front : rear;
        float dir = toFront > 0.5 ? -1.0 : 1.0;
        float s = fract((p.y - gy) * dir / 22.0 - u_time * (0.4 + 2.4 * share));
        float chev = clamp(1.0 - abs(s - 0.5 - abs(p.x) / 22.0) * 7.0, 0.0, 1.0);
        float within = toFront > 0.5 ? span(p.y, fy, gy) : span(p.y, gy, ry);
        acc = over(acc, u_edge * 0.6, clamp(0.5 - shaft, 0.0, 1.0) * within * 0.6);
        acc = over(acc, u_accent, chev * share * within * clamp(1.0 - abs(p.x) / 8.0, 0.0, 1.0));
    }
    acc = over(acc, u_accent * 0.9, clamp(0.5 - fa, 0.0, 1.0) * (0.25 + 0.75 * front));
    acc = over(acc, u_accent * 0.9, clamp(0.5 - ra, 0.0, 1.0) * (0.25 + 0.75 * rear));
    /* the wheels, their rims catching the axle's light */
    for (int i = 0; i < 4; i++) {
        float sx = i == 0 || i == 2 ? -1.0 : 1.0, ax = i < 2 ? fy : ry, lit = i < 2 ? front : rear;
        float wd = box(p - vec2(sx * (track + 12.0), ax), vec2(13.0, 30.0), 7.0);
        acc = over(acc, u_wheel, clamp(0.5 - wd, 0.0, 1.0));
        acc = over(acc, mix(u_edge, u_accent, lit), clamp(1.4 - abs(wd), 0.0, 1.0));
    }
    gl_FragColor = acc;
}`;

/**
 * The shift light: u_count round lights in a row, lit up to u_value (0..1), green, then yellow, then red; at
 * the shift point (u_flash 1) all of them red and blinking on the renderer's clock.
 */
const LEDS_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform highp float u_time;
uniform float u_value;
uniform float u_count;
uniform float u_flash;
uniform float u_soft;
uniform float u_shape;             /* 0: round lights, 1: thin segments */
uniform vec3 u_off;
uniform vec3 u_green;
uniform vec3 u_yellow;
uniform vec3 u_red;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size;
    float cell = u_size.x / u_count, i = floor(p.x / cell), f = (i + 0.5) / u_count;
    vec2 c = vec2((i + 0.5) * cell, u_size.y * 0.5);
    float r = min(cell * 0.32, u_size.y * 0.3), d = length(p - c);
    if (u_shape > 0.5) {
        /* thin segments instead of round lights: d measured to a slim rounded bar, its "radius" half its height */
        vec2 q = abs(p - c) - vec2(cell * 0.36 - 2.0, 0.0);
        r = max(2.0, u_size.y * 0.16);
        d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    }
    bool on = f <= u_value || u_flash > 0.5;
    vec3 col = f < 0.5 ? u_green : f < 0.8 ? u_yellow : u_red;
    if (u_flash > 0.5) col = u_red;
    float blink = u_flash > 0.5 ? 1.0 - step(0.5, fract(u_time * 7.0)) : 1.0;
    vec4 acc = vec4(0.0);
    float lit = on ? blink : 0.0;
    /* the glow, faded out before the light's own cell ends so the lights don't sit in squares */
    float fade = smoothstep(cell * 0.5, cell * 0.28, abs(p.x - c.x)) * smoothstep(u_size.y * 0.5, u_size.y * 0.25, abs(p.y - c.y));
    acc = over(acc, col, exp(-max(d - r, 0.0) * max(d - r, 0.0) / (r * r * 0.5)) * 0.6 * (1.0 - u_soft * 0.7) * lit * fade);
    acc = over(acc, mix(u_off, col * (1.0 + 0.25 * (1.0 - d / r)), lit), clamp(r - d + 0.5, 0.0, 1.0));
    acc = over(acc, u_off * 1.8, clamp(1.2 - abs(d - r), 0.0, 1.0) * (1.0 - lit));
    gl_FragColor = acc;
}`;

/*
 * Freedom (layout_freedom.js): the waving flag, the eagles and the fireworks. Each animates on the renderer's own
 * clock (u_time): nothing is sent to move them. Small loops, no uniform arrays (a merged shader with big arrays
 * once rebooted the KOMBI).
 */
const HASH = `
float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
`;

/**
 * The stars and stripes, waving, dimmed under the readings.
 *   u_dim     the flag's brightness 0..1
 *   u_red, u_white, u_blue
 */
const FLAG_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform highp float u_time;
uniform float u_dim;
uniform vec3 u_red;
uniform vec3 u_white;
uniform vec3 u_blue;
varying vec2 v_uv;
float star5(vec2 p, float r, float rf) {
    vec2 k1 = vec2(0.809016994, -0.587785252), k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
void main() {
    vec2 p = v_uv * u_size;
    float t = u_time;
    /* the wave: the cloth's rise and its light */
    float w = sin(p.x * 0.006 - t * 1.4 + p.y * 0.002);
    p.y += w * 10.0;
    float shade = 0.72 + 0.28 * sin(p.x * 0.006 - t * 1.4 + 0.9 + p.y * 0.002);
    float sh = u_size.y / 13.0;
    float stripe = mod(floor(p.y / sh), 2.0);           /* 0: red, 1: white */
    vec3 col = stripe < 0.5 ? u_red : u_white * 0.55;
    /* the canton: 7 stripes deep, 0.4 of the width, 50 stars */
    if (p.x < u_size.x * 0.4 && p.y < sh * 7.0) {
        col = u_blue;
        vec2 cs = vec2(u_size.x * 0.4 / 12.0, sh * 7.0 / 10.0);
        vec2 c = floor(p / cs), f = (fract(p / cs) - 0.5) * cs;
        float on = mod(c.x + c.y, 2.0) < 0.5 ? 1.0 : 0.0;
        float d = star5(f * vec2(1.0, -1.0), min(cs.x, cs.y) * 0.42, 0.45);
        float twinkle = 0.75 + 0.25 * sin(t * 3.0 + c.x * 1.7 + c.y * 2.3);
        col = mix(col, u_white * twinkle, clamp(0.5 - d, 0.0, 1.0) * on);
    }
    gl_FragColor = vec4(col * shade * u_dim, 1.0);
}`;

/**
 * Bald eagles flying across: two, at their own speeds and heights, wings beating.
 *   u_body, u_head (and tail), u_beak, u_rim (a light edge, to read on the dark flag)
 */
const EAGLE_FS = `#version 100
${HIGHP}${COMMON}${HASH}
uniform vec2 u_size;
uniform highp float u_time;
uniform vec3 u_body;
uniform vec3 u_head;
uniform vec3 u_beak;
uniform vec3 u_rim;
varying vec2 v_uv;
float seg(vec2 p, vec2 a, vec2 b, float ra, float rb) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - mix(ra, rb, h);
}
float ell(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
void main() {
    vec2 p = v_uv * u_size;
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 2; i++) {
        float fi = float(i);
        float speed = 0.045 + 0.02 * fi, sc = 1.7 - 0.45 * fi;   /* the near one bigger */
        float x = fract(u_time * speed + fi * 0.47) * (u_size.x + 520.0) - 260.0;
        float y = u_size.y * (0.42 + 0.22 * fi) + sin(u_time * 0.8 + fi * 2.0) * 10.0;
        vec2 q = (p - vec2(x, y)) / sc;
        if (abs(q.x) > 130.0 || abs(q.y) > 110.0) continue;   /* (in the eagle's own units) */
        float flap = sin(u_time * 5.0 + fi * 1.3);
        /* the wings: the far one darker, from the shoulders to the tips, primaries spread */
        vec2 tipN = vec2(-30.0 + 18.0 * flap, -82.0 * flap - 12.0), tipF = vec2(-22.0 + 14.0 * flap, -64.0 * flap - 6.0);
        float wf = seg(q, vec2(4.0, -2.0), tipF, 15.0, 3.0);
        float wn = min(seg(q, vec2(-2.0, 0.0), tipN, 17.0, 3.0), min(seg(q, vec2(-2.0, 0.0), tipN + vec2(-14.0, 6.0), 12.0, 2.0), seg(q, vec2(-2.0, 0.0), tipN + vec2(10.0, 8.0), 12.0, 2.0)));
        float body = ell(q - vec2(0.0, 4.0), vec2(42.0, 13.0));
        float tail = seg(q, vec2(-36.0, 5.0), vec2(-62.0, 9.0), 8.0, 11.0);
        float head = length(q - vec2(44.0, -2.0)) - 11.0;
        float beak = seg(q, vec2(50.0, 0.0), vec2(62.0, 4.0), 4.0, 1.0);
        float eye = length(q - vec2(48.0, -5.0)) - 1.6;
        float dark = min(min(body, wn), wf);
        acc = over(acc, u_rim, clamp(1.5 - abs(min(dark, min(head, tail))), 0.0, 1.0) * 0.55);
        acc = over(acc, u_body * 0.7, clamp(0.5 - wf, 0.0, 1.0));
        acc = over(acc, u_body, clamp(0.5 - min(body, wn), 0.0, 1.0));
        acc = over(acc, u_head, clamp(0.5 - min(head, tail), 0.0, 1.0));
        acc = over(acc, u_beak, clamp(0.5 - beak, 0.0, 1.0));
        acc = over(acc, vec3(0.05), clamp(0.5 - eye, 0.0, 1.0));
    }
    gl_FragColor = acc;
}`;

/**
 * Fireworks: three bursts in turn, each a rising trail, a flash and 14 sparks falling and fading, in red,
 * white or blue.
 *   u_red, u_white, u_blue; u_value: none (they go off on their own)
 */
const FIREWORKS_FS = `#version 100
${HIGHP}${COMMON}${HASH}
uniform vec2 u_size;
uniform highp float u_time;
uniform vec3 u_red;
uniform vec3 u_white;
uniform vec3 u_blue;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size;
    vec3 col = vec3(0.0);
    float a = 0.0;
    for (int i = 0; i < 3; i++) {
        float fi = float(i), P = 2.9 + 0.4 * fi;
        float tt = u_time + fi * 1.13, n = floor(tt / P), f = fract(tt / P);
        float seed = n * 7.31 + fi * 3.17;
        vec2 c = vec2(mix(0.2, 0.8, hash1(seed)), mix(0.25, 0.55, hash1(seed + 1.0))) * u_size;
        float pick = hash1(seed + 2.0);
        vec3 k = pick < 0.34 ? u_red : pick < 0.67 ? u_white : u_blue;
        if (f < 0.22) {
            /* the rocket going up, a short trail */
            float g = f / 0.22;
            vec2 r = vec2(c.x, mix(u_size.y + 10.0, c.y, g * (2.0 - g)));
            float d = length((p - r) * vec2(1.0, 0.35));
            float s = exp(-d * d / 6.0);
            col += vec3(1.0, 0.85, 0.6) * s; a += s;
        } else {
            float g = (f - 0.22) / 0.78, R = 130.0 + 70.0 * hash1(seed + 3.0);
            float fade = pow(1.0 - g, 1.6);
            float fl = exp(-length(p - c) / 40.0) * max(0.0, 1.0 - g * 6.0);   /* the flash */
            col += k * fl * 1.4; a += fl;
            for (int j = 0; j < 14; j++) {
                float fj = float(j), ang = fj * 0.4488 + hash1(seed + fj) * 0.3;
                vec2 sp = c + vec2(cos(ang), sin(ang)) * R * (1.0 - pow(1.0 - g, 2.2)) * (0.75 + 0.25 * hash1(seed + fj + 9.0)) + vec2(0.0, 60.0 * g * g);
                float d = length(p - sp);
                float s = exp(-d * d / 10.0) * fade * 1.3 + exp(-d / 9.0) * fade * 0.25;
                col += k * s; a += s;
            }
        }
    }
    a = clamp(a, 0.0, 1.0);
    gl_FragColor = vec4(a > 0.0 ? min(col / max(a, 0.001), vec3(1.0)) : vec3(0.0), a);
}`;

/**
 * A face from a photo (RNZALI Cluster's "RNZ Face"): the picture (u_image, RGBA with its own alpha), whose mouth
 * opens with u_value. Below the mouth's line the picture is pulled down by the opening, the pull fading out at
 * the chin's foot, so the jaw drops and the beard stretches; between the lips the mouth's inside shows (teeth at
 * the top, the tongue at the bottom). Near the red line it shakes and blushes (u_shake), and every few seconds a
 * glint runs across the sunglasses (on the renderer's clock: nothing is sent for it).
 *   u_mouth   the mouth's centre x, its line's y at the centre (0..1 of the picture), its half width, the line's slope
 *   u_jaw     the chin's foot y, the widest opening (0..1 of the picture's height), unused, unused
 *   u_glass   the glasses' box: top y, bottom y, right x, the glint's period (s)
 *   u_value   how open, 0..1;   u_shake  0..1
 */
const FACE_FS = `#version 100
${HIGHP}
uniform vec2 u_size;
uniform sampler2D u_image;
uniform vec4 u_mouth;
uniform vec4 u_jaw;
uniform vec4 u_glass;
uniform float u_value;
uniform float u_shake;
uniform highp float u_time;
uniform vec3 u_inside;
uniform vec3 u_teeth;
uniform vec3 u_tongue;
uniform vec3 u_blush;
varying vec2 v_uv;
void main() {
    vec2 uv = v_uv + u_shake * vec2(sin(u_time * 53.0), cos(u_time * 47.0)) * 0.006;
    float mx = u_mouth.x, hw = u_mouth.z;
    float my = u_mouth.y + (uv.x - mx) * u_mouth.w;
    float dx = (uv.x - mx) / hw;
    float open = clamp(u_value, 0.0, 1.0) * u_jaw.y * clamp(1.0 - dx * dx, 0.0, 1.0);
    vec2 s = uv;
    float below = uv.y - my, inMouth = 0.0;
    if (below > 0.0 && open > 0.0005) {
        float drop = open * (1.0 - smoothstep(u_jaw.x - 0.06, u_jaw.x + 0.08, uv.y));
        s.y = uv.y - drop;
        if (s.y < my) inMouth = 1.0;
    }
    vec4 px = texture2D(u_image, clamp(s, 0.0, 1.0));
    vec3 col = px.rgb;
    float a = px.a;
    if (inMouth > 0.5) {
        float t = clamp(below / max(open, 0.0005), 0.0, 1.0);          /* 0 at the upper lip, 1 at the lower */
        float edge = clamp(1.0 - dx * dx, 0.0, 1.0);
        col = u_inside * (0.55 + 0.45 * edge);
        float teeth = (1.0 - smoothstep(0.22, 0.30, t)) * step(0.12, fract(dx * 3.5 + 0.5));
        col = mix(col, u_teeth, teeth * smoothstep(0.0, 0.25, edge));
        col = mix(col, u_tongue, smoothstep(0.62, 0.85, t) * edge);
        a = 1.0;
    }
    /* the glint across the dark lenses */
    float lum = dot(px.rgb, vec3(0.299, 0.587, 0.114));
    float lens = step(u_glass.x, uv.y) * step(uv.y, u_glass.y) * step(uv.x, u_glass.z) * (1.0 - smoothstep(0.30, 0.45, lum));
    float pos = fract(u_time / u_glass.w) * 2.4 - 0.4, q = uv.x * 0.8 + (uv.y - u_glass.x) * 1.2;
    col += vec3(1.0) * 0.85 * lens * exp(-(q - pos) * (q - pos) / 0.0016) * a;
    col = mix(col, col * u_blush * 1.5, u_shake * 0.4);
    gl_FragColor = vec4(col, a);
}`;

/*
 * "Manele Edition" (RNZALI Cluster): a character with RNZ's head from a photo on a cartoon body, drawn by the cluster in
 * two layers over the same rectangle: the body (MANELE_BODY_FS) and the head (MANELE_HEAD_FS) in front of it. Both
 * work in a 440 x 524 design space (scaled to the layer) and take the same pose from MANELE_POSE, so they move as one.
 * Every motion runs on the renderer's clock (u_time); the head unit sends only the eased weights of manele_state.js:
 *   u_pose  dance 0..1, special dance 0..1, the left arm pointing (turn signal) 0..1, panic (braking) 0..1
 *   u_mood  trousers down 0..1, excited 0..1, amazed 0..1, the right arm pointing 0..1
 */
const MANELE_POSE = `
uniform vec4 u_pose;
uniform vec4 u_mood;
uniform highp float u_time;
const float PI = 3.14159265;
vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
/* the beat: ~100 bpm, faster in the special dance */
float beatPh() { return u_time * 10.5 * (1.0 + 0.3 * u_pose.y); }
/* the body's offset (design px), its lean and the head's extra tilt (rad), the arms (screen-left upper, fore,
   screen-right upper, fore: absolute angles, 0 hanging down, PI straight up, + away from the body), the knees' bend */
void pose(out vec2 off, out float lean, out float htilt, out vec4 arms, out float knee) {
    float t = u_time, dance = u_pose.x, sp = u_pose.y, L = u_pose.z, panic = u_pose.w, pants = u_mood.x, R = u_mood.w;
    float b = beatPh(), dw = smoothstep(0.0, 0.5, dance);
    knee = (0.5 + 0.5 * sin(b)) * (0.25 + 0.45 * sp) * dw;
    off = vec2(sin(b * 0.5) * (18.0 + 14.0 * sp) * dw, -abs(sin(b)) * 8.0 * dw + knee * 22.0 + sin(t * 1.4) * 1.5 * (1.0 - dw));
    lean = sin(b * 0.5) * (0.06 + 0.05 * sp) * dw;
    htilt = sin(b * 0.5 + 0.8) * 0.13 * dw + sin(t * 31.0) * 0.07 * panic;
    /* idle: the microphone at his chin, the other arm hanging; now and then a shrug (every 9 s) */
    float ph = fract(t / 9.0), shrug = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.12, 0.2, ph));
    vec4 idle = vec4(0.25, -2.55, 0.18 + 0.5 * shrug, 0.35 + 1.0 * shrug);
    /* the dance: both hands up, the wrists turning, the shoulders going */
    vec4 dnc = vec4(2.35 + sin(b) * 0.2, 2.5 + sin(b * 2.0) * 0.55, 2.2 + sin(b + PI) * 0.25, 2.8 + sin(b * 2.0 + 1.5) * 0.5);
    vec4 a = mix(idle, dnc, dw);
    float wave = sin(t * 9.42);            /* 1.5 Hz, a turn signal's rhythm */
    a.xy = mix(a.xy, vec2(1.7, 1.95 + wave * 0.5), L);
    a.zw = mix(a.zw, vec2(1.7, 1.95 + wave * 0.5), R);
    float pull = pants * (1.0 - panic);    /* pulling the trousers up again: the hands at the waist */
    a = mix(a, vec4(0.35, -0.6, 0.35, -0.6), pull);
    a = mix(a, vec4(2.7 + sin(t * 22.0) * 0.15, 2.9 + sin(t * 27.0) * 0.35, 2.7 + sin(t * 23.0 + 1.0) * 0.15, 2.9 + sin(t * 26.0 + 2.0) * 0.35), panic);
    arms = a;
    off.y += panic * (6.0 + sin(t * 40.0) * 2.0);
}
`;

/** The body: the dance floor's glow, legs, sneakers, the briefs (red, white hearts), the trousers (down as far as they
 * slipped), neck, a black polo with a gold chain, the arms with the microphone, music notes, money in the special dance. */
const MANELE_BODY_FS = `#version 100
${HIGHP}${COMMON}${MANELE_POSE}
uniform vec2 u_size;
varying vec2 v_uv;
float cov(float d, float aa) { return clamp(0.5 - d / aa, 0.0, 1.0); }
float sdCap(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdRBox(vec2 p, vec2 c, vec2 h, float r) { vec2 q = abs(p - c) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdEll(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return (length(q) - 1.0) * min(r.x, r.y); }
float dot2(vec2 v) { return dot(v, v); }
/* a heart, its point at the origin, y up, about 1 unit tall */
float sdHeart(vec2 p) {
    p.x = abs(p.x);
    if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355;
    return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
vec2 armDir(float a, float side) { return vec2(side * sin(a), cos(a)); }
void main() {
    float k = u_size.x / 440.0, aa = 1.0 / k;
    vec2 p = v_uv * u_size / k;
    vec2 off; float lean, htilt, knee; vec4 arms;
    pose(off, lean, htilt, arms, knee);
    float cx = 220.0, dance = u_pose.x, sp = u_pose.y, pants = u_mood.x;
    vec4 acc = vec4(0.0);
    /* the dance floor: a soft glow, its colour drifting slowly, only while dancing */
    vec3 disco = 0.5 + 0.5 * cos(6.2832 * (u_time * 0.08 + vec3(0.0, 0.33, 0.67)));
    acc = over(acc, disco, smoothstep(30.0, -10.0, sdEll(p, vec2(cx, 510.0), vec2(170.0, 14.0))) * 0.35 * smoothstep(0.05, 0.4, dance));
    vec2 tc = vec2(cx + off.x, 282.0 + off.y);
    vec2 tp = tc + rot(p - tc, -lean);
    float waist = 365.0 + off.y;
    vec2 hipL = vec2(cx - 30.0 + off.x, waist + 6.0), hipR = vec2(cx + 30.0 + off.x, waist + 6.0);
    vec2 footL = vec2(cx - 36.0, 492.0), footR = vec2(cx + 36.0, 492.0);
    vec2 kneeL = mix(hipL, footL, 0.5) + vec2(-8.0 - 34.0 * knee, 0.0), kneeR = mix(hipR, footR, 0.5) + vec2(8.0 + 34.0 * knee, 0.0);
    /* legs (a little hairy), sneakers with a red line */
    vec3 skin = vec3(0.80, 0.60, 0.50);
    float legs = min(min(sdCap(p, hipL, kneeL, 15.0), sdCap(p, kneeL, footL, 13.0)), min(sdCap(p, hipR, kneeR, 15.0), sdCap(p, kneeR, footR, 13.0)));
    float hair = step(0.86, fract(sin(dot(floor(p / 3.0), vec2(12.9898, 78.233))) * 43758.5453));
    acc = over(acc, mix(skin, skin * 0.5, hair * 0.7), cov(legs, aa));
    float shoes = min(sdEll(p, footL + vec2(-7.0, 12.0), vec2(27.0, 11.0)), sdEll(p, footR + vec2(7.0, 12.0), vec2(27.0, 11.0)));
    acc = over(acc, vec3(0.93), cov(shoes, aa));
    acc = over(acc, vec3(0.75, 0.12, 0.15), cov(abs(shoes + 3.0) - 1.2, aa) * 0.6);
    /* the briefs: red with white hearts (never less: no nudity) */
    float briefs = max(sdRBox(p, vec2(cx + off.x, waist + 20.0), vec2(54.0, 24.0), 10.0), -sdEll(p, vec2(cx + off.x, waist + 58.0), vec2(20.0, 24.0)));
    vec2 hp = mod(p - vec2(cx + off.x, waist), 18.0) - 9.0;
    float hearts = sdHeart(vec2(hp.x, 4.0 - hp.y) / 8.0) * 8.0;
    acc = over(acc, mix(vec3(0.86, 0.12, 0.16), vec3(1.0), cov(hearts, aa)), cov(briefs, aa));
    /* the trousers: from the waist, or as far down as they slipped, with a bunched rim (a white waistband when up) */
    float top = waist + 2.0 + pants * 118.0;
    float tr = min(min(min(sdCap(p, hipL, kneeL, 21.0), sdCap(p, kneeL, footL, 18.0)), min(sdCap(p, hipR, kneeR, 21.0), sdCap(p, kneeR, footR, 18.0))),
                   sdRBox(p, vec2(cx + off.x, waist + 18.0), vec2(56.0, 22.0), 8.0));
    tr = max(tr, top - p.y);
    vec3 blue = vec3(0.13, 0.27, 0.66);
    float rim = 1.0 - smoothstep(top + 5.0, top + 9.0, p.y + sin(p.x * 0.5) * 2.0);
    vec3 tcol = mix(blue, pants > 0.03 ? blue * 0.6 : vec3(0.9), rim);
    acc = over(acc, tcol, cov(tr, aa));
    /* neck, the black polo, its collar, a gold chain */
    acc = over(acc, skin * 0.9, cov(sdCap(p, vec2(cx + off.x, 168.0 + off.y), vec2(cx + off.x, 208.0 + off.y), 18.0), aa));
    vec3 polo = vec3(0.07, 0.08, 0.10);
    acc = over(acc, polo, cov(sdRBox(tp, tc, vec2(80.0, 88.0), 26.0), aa));
    float placket = min(sdCap(tp, tc + vec2(-16.0, -86.0), tc + vec2(0.0, -50.0), 2.0), sdCap(tp, tc + vec2(16.0, -86.0), tc + vec2(0.0, -50.0), 2.0));
    acc = over(acc, vec3(0.85), cov(placket, aa));
    vec2 cc = tc + vec2(0.0, -82.0);
    float chain = max(abs(sdEll(tp, cc, vec2(36.0, 46.0))) - 2.6, cc.y - tp.y);
    float links = 0.65 + 0.35 * step(0.5, fract(atan(tp.y - cc.y, tp.x - cc.x) * 7.0));
    acc = over(acc, vec3(0.97, 0.78, 0.22) * links, cov(chain, aa));
    /* the arms: sleeve, skin, hand; the microphone in the screen-left hand */
    vec2 shL = tc + rot(vec2(-74.0, -68.0), lean), shR = tc + rot(vec2(74.0, -68.0), lean);
    vec2 elL = shL + armDir(arms.x, -1.0) * 68.0, haL = elL + armDir(arms.y, -1.0) * 60.0;
    vec2 elR = shR + armDir(arms.z, 1.0) * 68.0, haR = elR + armDir(arms.w, 1.0) * 60.0;
    float skinArms = min(min(sdCap(p, shL, elL, 13.0), sdCap(p, elL, haL, 12.0)), min(sdCap(p, shR, elR, 13.0), sdCap(p, elR, haR, 12.0)));
    float hands = min(length(p - haL) - 14.0, length(p - haR) - 14.0);
    acc = over(acc, skin, cov(min(skinArms, hands), aa));
    acc = over(acc, polo, cov(min(sdCap(p, shL, mix(shL, elL, 0.55), 18.0), sdCap(p, shR, mix(shR, elR, 0.55), 18.0)), aa));
    vec2 md = normalize(haL - elL);
    acc = over(acc, vec3(0.05), cov(sdCap(p, haL - md * 4.0, haL + md * 30.0, 6.0), aa));
    acc = over(acc, vec3(0.22) + 0.18 * step(0.5, fract((p.x + p.y) * 0.35)), cov(length(p - (haL + md * 38.0)) - 11.0, aa));
    /* music notes rising while he dances */
    for (int i = 0; i < 3; i++) {
        float fi = float(i), ph = fract(u_time * 0.35 + fi / 3.0);
        vec2 np = vec2(cx + (fi - 1.0) * 150.0 + sin(ph * 6.0 + fi) * 15.0, 230.0 - ph * 210.0);
        float note = min(sdEll(p, np, vec2(9.0, 7.0)), sdRBox(p, np + vec2(8.0, -16.0), vec2(1.6, 16.0), 0.5));
        acc = over(acc, disco.zxy * 0.6 + 0.4, cov(note, aa) * smoothstep(0.1, 0.5, dance) * (1.0 - ph));
    }
    /* money raining in the special dance */
    for (int i = 0; i < 6; i++) {
        float fi = float(i), h = fract(sin(fi * 91.7) * 4375.85), ph = fract(u_time * (0.35 + 0.2 * h) + h);
        vec2 mp = vec2(30.0 + h * 380.0 + sin(ph * 9.0 + fi) * 20.0, -20.0 + ph * 560.0);
        vec2 lp = rot(p - mp, ph * 6.0 + fi);
        acc = over(acc, vec3(0.30, 0.68, 0.36), cov(sdRBox(lp, vec2(0.0), vec2(18.0, 9.0), 2.0), aa) * sp);
        acc = over(acc, vec3(0.85, 0.95, 0.85), cov(length(lp) - 4.0, aa) * sp);
    }
    gl_FragColor = acc;
}`;

/** The head, from the photo (u_image, RGBA): on the body's neck, tilting with the dance; the mouth sings with the beat
 * and opens wide in a panic or in amazement, a smirk when idle; big cartoon eyes in a panic, blinking when calm.
 *   u_mouth  the mouth's centre x, its line's y, its half width, the chin's foot y (0..1 of the photo)
 *   u_eyes   the left eye's x, y, the right eye's x, y */
const MANELE_HEAD_FS = `#version 100
${HIGHP}${COMMON}${MANELE_POSE}
uniform vec2 u_size;
uniform sampler2D u_image;
uniform vec4 u_mouth;
uniform vec4 u_eyes;
uniform vec3 u_inside;
uniform vec3 u_teeth;
uniform vec3 u_tongue;
varying vec2 v_uv;
void main() {
    float k = u_size.x / 440.0;
    vec2 p = v_uv * u_size / k;
    vec2 off; float lean, htilt, knee; vec4 arms;
    pose(off, lean, htilt, arms, knee);
    vec2 hc = vec2(220.0 + off.x, 110.0 + off.y), hs = vec2(168.0, 210.0), piv = hc + vec2(0.0, 88.0);
    vec2 uv = (piv + rot(p - piv, -(htilt + lean)) - (hc - hs * 0.5)) / hs;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }
    float t = u_time, dance = u_pose.x, panic = u_pose.w, excited = u_mood.y, amazed = u_mood.z;
    float dw = smoothstep(0.05, 0.5, dance);
    float openA = max(max(dw * (0.25 + 0.3 * (0.5 + 0.5 * sin(beatPh() * 2.0))), panic), max(amazed * 0.7, excited * 0.55));
    float mx = u_mouth.x, my = u_mouth.y, hw = u_mouth.z;
    float dx = (uv.x - mx) / hw;
    float open = openA * 0.11 * clamp(1.0 - dx * dx, 0.0, 1.0);
    /* the smirk: a little opening at one corner, when calm */
    float ds = (uv.x - (mx + hw * 0.55)) / (hw * 0.5);
    open = max(open, (1.0 - dw) * (1.0 - panic) * (1.0 - amazed) * 0.022 * clamp(1.0 - ds * ds, 0.0, 1.0));
    vec2 s = uv;
    float below = uv.y - my, inMouth = 0.0;
    if (below > 0.0 && open > 0.0005) {
        s.y = uv.y - open * (1.0 - smoothstep(u_mouth.w - 0.06, u_mouth.w + 0.05, uv.y));
        if (s.y < my) inMouth = 1.0;
    }
    vec4 px = texture2D(u_image, clamp(s, 0.0, 1.0));
    vec3 col = px.rgb;
    float a = px.a;
    if (inMouth > 0.5) {
        float tt = clamp(below / max(open, 0.0005), 0.0, 1.0), edge = clamp(1.0 - dx * dx, 0.0, 1.0);
        col = u_inside * (0.55 + 0.45 * edge);
        col = mix(col, u_teeth, (1.0 - smoothstep(0.22, 0.32, tt)) * step(0.12, fract(dx * 3.5 + 0.5)));
        col = mix(col, u_tongue, smoothstep(0.6, 0.85, tt) * edge);
        a = 1.0;
    }
    /* the eyes: big and round in a panic (wide when amazed or excited), else a blink every few seconds */
    float big = max(panic, max(amazed * 0.75, excited * 0.6)), pxw = 1.0 / (hs.x * k);
    vec2 asp = vec2(1.0, hs.y / hs.x);
    float closed = step(fract(t / 4.3), 0.035) * (1.0 - step(0.1, big));
    for (int i = 0; i < 2; i++) {
        vec2 e = i == 0 ? u_eyes.xy : u_eyes.zw;
        vec2 d = (uv - e) * asp;
        float r = length(d), er = 0.085 * big;
        if (big > 0.02) {
            col = mix(col, vec3(0.03), clamp((er + 0.012 - r) / pxw + 0.5, 0.0, 1.0));
            col = mix(col, vec3(0.98), clamp((er - r) / pxw + 0.5, 0.0, 1.0));
            vec2 pc = vec2(sin(t * 17.0 + float(i)), cos(t * 13.0)) * 0.012 * panic;
            col = mix(col, vec3(0.02), clamp((er * 0.38 - length(d - pc)) / pxw + 0.5, 0.0, 1.0));
            a = max(a, clamp((er + 0.012 - r) / pxw + 0.5, 0.0, 1.0));
        }
        vec2 dl = d / vec2(0.07, 0.03);
        float lid = clamp((1.0 - length(dl)) * 0.03 / pxw + 0.5, 0.0, 1.0) * closed;
        vec3 lidc = texture2D(u_image, e + vec2(0.0, -0.075)).rgb;
        col = mix(col, lidc, lid);
        col = mix(col, lidc * 0.45, lid * smoothstep(0.4, 1.0, dl.y) * step(abs(dl.x), 0.95));
    }
    gl_FragColor = vec4(col, a);
}`;

/**
 * VICE_BG_FS - GTA Vice City / Bucharest twilight skyline shader.
 * Samples the photorealistic Bucharest twilight scene asset (vice_bg.wad) with animated
 * star twinkling across the skyline and subtle neon reflections in the wet asphalt.
 */
const VICE_BG_FS = `#version 100
${HIGHP}
uniform vec2 u_size;
uniform highp float u_time;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
    vec4 tex = texture2D(u_image, v_uv);
    vec3 col = tex.rgb;

    // Subtle star twinkle in upper twilight sky (y < 0.28)
    if (v_uv.y < 0.28 && dot(col, vec3(0.333)) < 0.4) {
        vec2 sp = floor(v_uv * u_size / 24.0);
        float rnd = fract(sin(dot(sp, vec2(12.9898, 78.233))) * 43758.5453);
        if (rnd > 0.982) {
            float blink = 0.5 + 0.5 * sin(u_time * 3.0 + rnd * 6.28);
            col += vec3(0.9, 0.85, 1.0) * blink * 0.4;
        }
    }

    // Subtle breathing pulse on the neon wet road reflections (y > 0.65)
    if (v_uv.y > 0.65) {
        float pulse = 0.04 * sin(u_time * 2.2);
        if (col.r > 0.25 && col.b > 0.25) {
            col += vec3(0.12, 0.02, 0.08) * pulse;
        }
    }

    gl_FragColor = vec4(col, 1.0);
}`;

/**
 * VICE_CAR_FS - Photorealistic BMW rear silhouette with reactive LED tail lights,
 * dynamic turn signals, and procedural curling tire smoke / exhaust mist on the road.
 */
const VICE_CAR_FS = `#version 100
${HIGHP}
uniform vec2 u_size;
uniform highp float u_time;
uniform float u_value;
uniform vec4 u_state;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
    float push = max(u_value, u_state.x);
    float turn = u_state.y;
    float spd = u_state.z;

    // Subtle rear suspension squat under acceleration push
    vec2 uv = v_uv;
    uv.y -= push * 0.008;

    vec4 tex = (uv.y >= 0.0 && uv.y <= 1.0) ? texture2D(u_image, uv) : vec4(0.0);
    vec3 col = tex.rgb;
    float carAlpha = tex.a;

    // Dynamic reactive taillight flare
    float isTail = step(0.42, col.r) * (1.0 - step(0.28, col.g)) * (1.0 - step(0.28, col.b));
    if (isTail > 0.5) {
        float idlePulse = 0.08 * sin(u_time * 2.0);
        float boost = push * 0.55 + idlePulse;
        col.r = min(1.0, col.r * (1.0 + boost));
        col += vec3(0.25, 0.04, 0.06) * boost;
    }

    // Turn Signal Blink (1.5 Hz automotive crisp LED flash)
    float tCycle = fract(u_time * 1.5);
    float blink = smoothstep(0.0, 0.05, tCycle) * (1.0 - smoothstep(0.48, 0.52, tCycle));
    bool wantL = (turn < -0.5 || turn > 1.5);
    bool wantR = (turn > 0.5);

    // Dynamic LED turn indicator strips on BMW tail light clusters
    bool inLeftInd = (uv.x >= 0.13 && uv.x <= 0.38 && uv.y >= 0.39 && uv.y <= 0.47);
    bool inRightInd = (uv.x >= 0.62 && uv.x <= 0.87 && uv.y >= 0.39 && uv.y <= 0.47);
    vec3 amberLed = vec3(1.0, 0.66, 0.04);
    vec3 amberCore = vec3(1.0, 0.96, 0.65);

    if (wantL && inLeftInd && blink > 0.01 && col.r > 0.35) {
        col = mix(col, amberLed * 1.5, blink);
        if (col.r > 0.6) col += amberCore * blink * 0.5;
    }
    if (wantR && inRightInd && blink > 0.01 && col.r > 0.35) {
        col = mix(col, amberLed * 1.5, blink);
        if (col.r > 0.6) col += amberCore * blink * 0.5;
    }

    // Procedural curling tire smoke & exhaust mist on the road
    float roadMask = smoothstep(0.72, 0.80, v_uv.y) * (1.0 - smoothstep(0.96, 0.99, v_uv.y));
    float smokeIntensity = 0.22 + 0.78 * push + 0.30 * spd;

    vec2 pL = vec2((v_uv.x - 0.25) * 1.6, (v_uv.y - 0.82) * 3.0);
    vec2 pR = vec2((v_uv.x - 0.75) * 1.6, (v_uv.y - 0.82) * 3.0);
    float dEmitters = min(length(pL), length(pR));
    float spread = exp(-dEmitters * 3.5);

    float st = u_time * (1.2 + 2.5 * push);
    vec2 np = v_uv * vec2(8.0, 6.0);
    float n1 = sin(np.x * 5.0 + sin(np.y * 4.0 + st)) * cos(np.y * 5.0 + sin(np.x * 4.0 - st * 0.8));
    float n2 = sin(np.x * 2.1 + st * 0.7) * cos(np.y * 2.3 - st * 0.9);
    float noiseVal = clamp(0.5 + 0.35 * n1 + 0.25 * n2, 0.0, 1.0);

    float smokeDensity = clamp(spread * roadMask * noiseVal * smokeIntensity * 0.85, 0.0, 1.0);

    // Synthwave lighting on road smoke
    float tailGlow = clamp(1.0 - (v_uv.y - 0.5) * 2.0, 0.0, 1.0);
    vec3 colSmoke = vec3(1.0, 0.15, 0.45) * tailGlow * 0.7
                  + vec3(0.0, 0.85, 1.0) * (1.0 - tailGlow) * 0.5
                  + vec3(0.9, 0.85, 1.0) * 0.35;

    // Amber ground reflection when signaling
    if (wantL && blink > 0.01) {
        float refL = clamp(1.0 - length(vec2((v_uv.x - 0.22) * 2.0, (v_uv.y - 0.85) * 4.0)), 0.0, 1.0);
        colSmoke += amberLed * refL * blink * 0.85;
    }
    if (wantR && blink > 0.01) {
        float refR = clamp(1.0 - length(vec2((v_uv.x - 0.78) * 2.0, (v_uv.y - 0.85) * 4.0)), 0.0, 1.0);
        colSmoke += amberLed * refR * blink * 0.85;
    }

    // Blend smoke with car and background
    float smokeOver = clamp((v_uv.y - 0.78) / 0.10, 0.0, 0.75);
    float smokeA = smokeDensity * (1.0 - carAlpha * (1.0 - smokeOver));

    vec3 finalRgb = col * (1.0 - smokeA) + colSmoke * smokeA;
    float finalA = clamp(carAlpha + smokeDensity * 0.85, 0.0, 1.0);

    gl_FragColor = vec4(finalRgb, finalA);
}`;

/**
 * VICE_PALM_FS - Neon palm tree badge with Bucharest cursive neon script.
 * Samples vice_palm.wad and renders realistic gas discharge electric tube flicker.
 */
const VICE_PALM_FS = `#version 100
${HIGHP}
uniform vec2 u_size;
uniform highp float u_time;
uniform sampler2D u_image;
varying vec2 v_uv;
void main() {
    vec4 tex = texture2D(u_image, v_uv);
    if (tex.a < 0.01) {
        gl_FragColor = vec4(0.0);
        return;
    }
    vec3 col = tex.rgb;

    float flick = 0.97 + 0.03 * sin(u_time * 35.0) + 0.02 * sin(u_time * 77.0);
    float isNeon = max(step(0.4, col.b), step(0.5, col.r));
    col *= mix(1.0, flick, isNeon);

    gl_FragColor = vec4(col, tex.a);
}`;

/**
 * VICE_GAUGE_FS - BMW Live Cockpit chevron gauge needle & neon track glow shader.
 * Renders an intense glowing neon needle cursor with synthetic bloom flare that glides
 * along the authentic angular 3-segment polygonal chevron arc from vn69nnn.webp:
 * - Sweeps clockwise on the left (Speedometer: 0-330 km/h) with Electric Cyan -> Magenta gradient
 * - Sweeps counter-clockwise on the right (Tachometer: 0-8000 RPM) with Blue -> Orange -> Redline gradient
 * - White-hot neon cursor tip with synthetic bloom flare at the live value
 * - u_span.x > 0.5 triggers horizontal mirroring for the right RPM gauge
 */
const VICE_GAUGE_FS = `#version 100
${HIGHP}
uniform vec2 u_size;
uniform vec4 u_span;
uniform float u_value;
uniform float u_red;
uniform vec3 u_fill0;
uniform vec3 u_fill1;
uniform vec3 u_redc;
uniform vec3 u_tip;
varying vec2 v_uv;

void tSeg(vec2 p, vec2 a, vec2 b, float l, float cL, float tL, inout float mD, inout float bT) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * h);
    if (d < mD) {
        mD = d;
        bT = (cL + h * l) / tL;
    }
}

void main() {
    vec2 p = v_uv * u_size;
    if (u_span.x > 0.5) p.x = u_size.x - p.x;

    // Chevron polyline vertices in layer coordinates (w=340, h=575)
    vec2 p0 = vec2(304.0, 560.0);
    vec2 p1 = vec2(197.0, 530.0);
    vec2 p2 = vec2(75.0,  440.0);
    vec2 p3 = vec2(15.0,  350.0);
    vec2 p4 = vec2(48.0,  230.0);
    vec2 p5 = vec2(145.0, 140.0);
    vec2 p6 = vec2(235.0,  50.0);
    vec2 p7 = vec2(300.0,  20.0);

    float minD = 999.0;
    float bestT = 0.0;
    const float totL = 791.8;

    tSeg(p, p0, p1, 111.4, 0.0,   totL, minD, bestT);
    tSeg(p, p1, p2, 151.3, 111.4, totL, minD, bestT);
    tSeg(p, p2, p3, 108.2, 262.7, totL, minD, bestT);
    tSeg(p, p3, p4, 124.5, 370.9, totL, minD, bestT);
    tSeg(p, p4, p5, 132.3, 495.4, totL, minD, bestT);
    tSeg(p, p5, p6, 127.3, 627.7, totL, minD, bestT);
    tSeg(p, p6, p7,  71.6, 755.0, totL, minD, bestT);

    if (minD > 28.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float v = clamp(u_value, 0.0, 1.0);
    float dt = abs(bestT - v);

    // Tip cursor: intense white-hot core + neon bloom flare
    float core = exp(-dt * dt * 3200.0) * exp(-minD * minD / 25.0) * (v > 0.005 ? 1.0 : 0.0);
    float flare = exp(-dt * dt * 480.0) * exp(-minD * minD / 110.0) * (v > 0.005 ? 1.0 : 0.0);

    // Subtle neon track illumination behind needle
    float lit = clamp((v - bestT) * 120.0 + 0.5, 0.0, 1.0);
    float trackGlow = exp(-minD * minD / 65.0) * lit * 0.4;

    vec3 fc = mix(u_fill0, u_fill1, clamp(bestT / max(v, 0.001), 0.0, 1.0));
    if (bestT >= u_red) fc = u_redc;

    vec3 col = fc * (trackGlow + flare * 0.9) + u_tip * core * 1.5;
    float alpha = clamp(core * 1.2 + flare * 0.85 + trackGlow, 0.0, 1.0);

    gl_FragColor = vec4(col, alpha);
}
`;

/**
 * VICE_WANTED_FS - GTA Vice City 6-star Wanted Level display.
 * Renders 6 neon five-pointed stars across width 190px:
 * - Unlit stars: subtle dark synthwave purple silhouette outline
 * - Lit stars: intense electric gold/yellow neon glow
 * - 6-star maximum wanted: flashes between crimson red and neon gold on u_time
 */
const VICE_WANTED_FS = `#version 100
${HIGHP}
uniform vec2 u_size;
uniform highp float u_time;
uniform float u_value;
varying vec2 v_uv;

float starDist(vec2 p, float r) {
    float a = atan(p.x, -p.y);
    float seg = 6.2831853 / 5.0;
    float f = mod(a + 3.14159265, seg) - seg * 0.5;
    float ra = r * (0.55 + 0.45 * cos(f * 2.5));
    return length(p) - ra;
}

void main() {
    vec2 p = v_uv * u_size;
    vec4 acc = vec4(0.0);

    float wantedFrac = clamp(u_value, 0.0, 1.0);

    for (int i = 0; i < 6; i++) {
        float cx = 16.0 + float(i) * 31.0;
        vec2 sp = p - vec2(cx, 13.0);
        float d = starDist(sp, 8.5);

        float thresh = (i == 0) ? 0.05 : (i == 1) ? 0.20 : (i == 2) ? 0.40 : (i == 3) ? 0.60 : (i == 4) ? 0.75 : 0.88;
        float isLit = step(thresh, wantedFrac);

        vec3 starCol = vec3(1.0, 0.85, 0.05);
        if (wantedFrac >= 0.88) {
            float flash = 0.5 + 0.5 * sin(u_time * 12.0);
            starCol = mix(vec3(1.0, 0.1, 0.2), vec3(1.0, 0.85, 0.05), flash);
        }

        float core = clamp(0.5 - d, 0.0, 1.0);
        float glow = exp(-max(d, 0.0) * max(d, 0.0) / 30.0) * (d > 0.0 ? 1.0 : 0.0);

        if (isLit > 0.5) {
            vec3 c = mix(vec3(1.0), starCol, clamp(d * 0.2 + 0.5, 0.0, 1.0));
            acc += vec4(c, 1.0) * (core + glow * 0.65);
        } else {
            float edge = clamp(1.2 - abs(d), 0.0, 1.0);
            acc += vec4(0.35, 0.15, 0.45, 0.6) * edge;
        }
    }

    acc.a = clamp(acc.a, 0.0, 1.0);
    gl_FragColor = acc;
}
`;

module.exports = { VICE_BG_FS, VICE_CAR_FS, VICE_PALM_FS, VICE_GAUGE_FS, VICE_WANTED_FS, MANELE_POSE, MANELE_BODY_FS, MANELE_HEAD_FS, FACE_FS, HIGHP, COMMON, GLYPH, FLAT_FS, PANEL_FS, DIAL_FS, BAND_FS, TEXT_FS, BG_FS, ICON_FS, SPARK_FS, CAR_FS, LEDS_FS, FLAG_FS, EAGLE_FS, FIREWORKS_FS };
