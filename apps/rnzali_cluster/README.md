# RNZALI Cluster: cum funcționează și cum scrii un layout

*Parte din [RNZALI Cluster](../../README.md).*

## Cum ajunge pe cluster

- Cluster-ul se desenează cu **RAMSES**. Head unit-ul publică o scenă (dreptunghiuri, shadere, o textură,
  uniforme), iar renderer-ul din KOMBI o desenează pe GPU-ul cluster-ului. Nu se trimite niciodată o imagine
  a cluster-ului.
- Serviciul [`cluster-render`](https://github.com/robertnisipeanu/idrive-apps/tree/main/native/cluster-render)
  cere slotul **0x203** (`panel`): tot cluster-ul de 1920×720, peste ceasurile originale și **sub martorii de avertizare**.
- **Fiecare piesă a unui layout este un strat**: un fragment shader GLSL ES 1.00 mic, pe propriul dreptunghi
  (`shaders.js`). Un shader mare care desenează multe piese a făcut cluster-ul să repornească, deci asta nu se face.
- **Limite:** 64 de straturi pe aplicație (`cluster-render` ≥ 0.4.2) și 96 în total pentru toate aplicațiile. Un layout are cel mult 60 de piese.
- **Ce se trimite:**
  - o singură dată: shaderele, culorile și atlasul de glife (câmp de distanță);
  - în mers: valorile acelor sau benzilor când se mișcă, textele și culorile când se schimbă. Câțiva KB/s, nimic când stă pe loc.

## Ce ascund sticla și KOMBI (`layout_common.js`)

Măsurate din fotografiile unui G05. Pe alte modele nu sunt verificate.

- colțurile de sus, tăiate oblic (`inCorner`);
- carcasa camerei, sus la mijloc: x 730–1190, y < 128 (`NOTCH`);
- cutia neagră a KOMBI, unde era treapta originală: x 1410–1662, y 262–454 (`GEARBOX_HOLE`);
- cutia eDrive, sus în dreapta (`EDRIVE_HOLE`);
- martorii de avertizare, jos la mijloc: x 560–1520, y ≥ 652 (`TELLTALES`);
- pe mașinile M (Settings > Cluster: M car): încă două cutii la mijloc (`M_HOLES`);
- harta (Waze sau cea originală), cu centrul pe `map`: x 416–1504, y 120–600 (`MAP`).

`node tools/clearance.js` listează orice piesă care ar sta sub ele, iar `tools/test_engine.js` verifică asta.

## Cum scrii un layout

Un layout este un fișier `layout_<id>.js`, adăugat în `layouts.js` și în setarea `layout` din `app.json`. El nu
desenează nimic: întoarce o listă de **piese**. Ajutoarele (texte, citiri, bare, unități, fereastra hărții) sunt
în `layout_common.js`, iar toate câmpurile unei piese sunt descrise în `engine.js`.

| kind | ce desenează cluster-ul | câmpuri principale |
|---|---|---|
| `flat` | o culoare | `colors: { color }` |
| `panel` | un card rotunjit: gradient, lumină sus, margine | `params.u_box` (rază, margine, lumină, opacitate) |
| `dial` | un ceas rotund cu ac: față, ramă, gradații, zonă roșie, cifre, arc de valoare, butuc, sticlă | `u_scale`, `u_arc`, `u_needle_dim`, `u_look`, `u_look2`; `value(d)`, `max` |
| `band` | un indicator pe arc (sau bară dreaptă): segmente, gradient, zonă roșie, vârf luminos, cifre | `u_geo`, `u_span`, `u_marks`, `u_red`; `value(d)` 0..1 |
| `text` | o linie de glife cu glow opțional | `text` (fix, sau `(d, t) => string`), `align`, `tracking` |
| `face` | o fotografie (textură RGBA, `image: { key, w, h, px }`) cu gura care se deschide după `value(d)` 0..1 | `u_mouth`, `u_jaw`, `u_glass`; `dyn` → `u_shake` |

Parametrii unei funcții de layout:

- `o`: opțiunile: unitățile, zona roșie, scala turației, centrul (`info`, `map`, `stock`), `cluster` (`m`), `vehicle`.
- `d`: datele mașinii: `speed` în km/h, `rpm`, `gear`, `stage`, `mode`, `driveMode`, `oil`, `coolant`, `outside` în °C, `soc` în %, `kw`, `erange` și `frange` în km.
- `t`: paleta layout-ului pentru stilul curent (`comfort`, `sport`, `efficient`).

Textele pot folosi doar glifele din atlas (`font_baked.js`).

`layout_horizon.js` este exemplul complet: trei centre, M car, banda de jos, PHEV și ICE.

## Verificare înainte de mașină

```sh
node tools/preview.js --layout horizon --look sport --centre map --kmh --out preview.png   # WebGL, limbajul shaderelor cluster-ului
node tools/test_engine.js && node tools/test_app.js && node tools/test_shared.js && node tools/clearance.js
python3 kit/tools/build.py rnzali_cluster     # are nevoie de oap-sdk/ (un stub ajunge pentru verificarea build-ului)
```

## Pe mașină, parcată, prima dată

1. Pagina aplicației: `Cluster renderer` trebuie să arate „connected”, `panel` trebuie să fie „shown” și să nu existe „refused”.
2. Martorii de avertizare se văd peste layout. Mesajele Check Control apar.
3. Schimbă modul de condus și selectorul (P/R/N/D, S/M): culorile și treapta urmează.
4. Oprește **Show on the cluster**: cluster-ul original revine.
5. **Signals** și **Logs** (coduri QR, sau fișier pe un stick USB) arată ce trimite mașina, dacă ceva rămâne pe `--`.
6. **Logurile se salvează și singure** pe orice stick USB din mașină: `cluster-logs/rnzali-auto-<pornire>.txt`, la 30 s
   după ce pornește aplicația, la 2 min, apoi la fiecare 5 min (același fișier, rescris). Te ajută când ecranul
   aplicației nu arată nimic (fără butoane). Conțin și dacă există socket-urile rendererului GPU care desenează
   ecranul aplicației și dacă HMI-ul arată ecranul aplicației.

## Siguranță

- **Oprit implicit:** nimic nu acoperă cluster-ul până nu pornești **Show on the cluster**.
- Martorii stau deasupra. Cluster-ul original revine când aplicația, serviciul de randare sau datele mașinii se opresc.
- Viteza afișată este semnalul real al mașinii, cu câteva procente sub cea indicată de cluster-ul original.
- Panoul și HUD-ul folosesc același ID de scenă: cât timp o aplicație desenează pe HUD, panoul nu pornește.
- Citirile prin diagnoză (boost, admisie) afișează pe mașină „Diagnostic mode active” cât timp rulează.
