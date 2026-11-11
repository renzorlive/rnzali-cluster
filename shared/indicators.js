'use strict';
/**
 * indicators.js - the turn signals from the car's own enums (de.bmw.body.Light StatusFunctionsIndicators /
 * StatusFunctionsIndicators2), which the SOME/IP binding hands over as their names (seen on a G05:
 * "DAUER_BLINKEN_RECHTS_EIN") or as numbers. From Cluster Info's indicators.js (eroobeeroo/idrive7-cluster-info).
 *
 *   controlIndicateDirection: 1 / 3 tap / steady left, 2 / 4 right, 8 both (hazards), 0 off;
 *   else activeFunctionIndicateDirection, the function blinking: 7 / 9 / 18 / 20 / 22 left, 8 / 10 / 19 / 21 / 23
 *   right, hazards and alarms both, 0 off.
 */
const ACTIVE_LEFT = [7, 9, 18, 20, 22], ACTIVE_RIGHT = [8, 10, 19, 21, 23], ACTIVE_BOTH = [1, 5, 6, 11, 12, 13, 16, 17, 24, 25];
const CONTROL = { BLINKEN_AUS: 0, TIPP_BLINKEN_LINKS_EIN: 1, TIPP_BLINKEN_RECHTS_EIN: 2, DAUER_BLINKEN_LINKS_EIN: 3,
    DAUER_BLINKEN_RECHTS_EIN: 4, BEIDSEITIGES_BLINKEN_EIN: 8 };
const ACTIVE = { BLINKEN_AUS: 0, CRASH_BLINKEN: 1, REVERSIER_BLINKEN: 2, QUITTIERUNGSBLINKEN_SCHAERFEN: 3,
    QUITTIERUNGSBLINKEN_ENTSCHAERFEN: 4, DWA_BLINKEN: 5, WARNBLINKEN_MANUELL: 6, DAUERBLINKEN_LINKS: 7, DAUERBLINKEN_RECHTS: 8,
    TIPPBLINKEN_LINKS: 9, TIPPBLINKEN_RECHTS: 10, UEBERFALLALARM: 11, FAS_WARNBLINKEN_AUSPRAEGUNG_1: 12, AUFFAHRWARNBLINKEN: 13,
    ANKUENDIGUNGSBLINKEN_OEFFNEN: 14, ANKUENDIGUNGSBLINKEN_SCHLIESSEN: 15, WARNBLINKEN_NACH_GEFAHRENBREMSUNG: 16,
    WARNBLINKEN_VON_RCP: 17, FAS_RICHTUNGSBLINKEN_LOWPRIO_LINKS: 18, FAS_RICHTUNGSBLINKEN_LOWPRIO_RECHTS: 19,
    FAS_RICHTUNGSBLINKEN_MIDPRIO_LINKS: 20, FAS_RICHTUNGSBLINKEN_MIDPRIO_RECHTS: 21, FAS_RICHTUNGSBLINKEN_HIGHPRIO_LINKS: 22,
    FAS_RICHTUNGSBLINKEN_HIGHPRIO_RECHTS: 23, FAS_WARNBLINKEN_AUSPRAEGUNG_2: 24, FAS_WARNBLINKEN_AUSPRAEGUNG_3: 25,
    ANKUENDIGUNGSBLINKEN_REMOTE_MOTORSTART: 26 };
const num = (x, names) => (typeof x === 'string' && x in names ? names[x] : x);

/** A field anywhere in a value, however it is wrapped. */
function one(v, key) {
    if (!v || typeof v !== 'object') return undefined;
    if (key in v) return v[key];
    for (const k of Object.keys(v)) { const r = one(v[k], key); if (r !== undefined) return r; }
    return undefined;
}
/** 'off' | 'left' | 'right' | 'both', or null when the value says nothing. */
function direction(c, a) {
    c = num(c, CONTROL); a = num(a, ACTIVE);
    let dir = null;
    if (c === 1 || c === 3) dir = 'left'; else if (c === 2 || c === 4) dir = 'right'; else if (c === 8) dir = 'both'; else if (c === 0) dir = 'off';
    if (dir === null || (dir === 'off' && typeof a === 'number' && a > 0 && a < 250)) {
        dir = ACTIVE_LEFT.indexOf(a) >= 0 ? 'left' : ACTIVE_RIGHT.indexOf(a) >= 0 ? 'right' : ACTIVE_BOTH.indexOf(a) >= 0 ? 'both' : a === 0 ? 'off' : dir;
    }
    return dir;
}
/** A StatusFunctionsIndicators(2) value as a number: -1 left, 1 right, 2 both, 0 off; null when it says nothing. */
function turnOf(v) {
    const dir = direction(one(v, 'controlIndicateDirection'), one(v, 'activeFunctionIndicateDirection'));
    return dir === 'left' ? -1 : dir === 'right' ? 1 : dir === 'both' ? 2 : dir === 'off' ? 0 : null;
}

module.exports = { direction, turnOf, one };
