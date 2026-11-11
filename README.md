> [!WARNING]
> **Atenție.** Proiect independent, neafiliat cu niciun producător auto sau furnizor de echipamente.
> Software-ul este oferit „ca atare”, fără nicio garanție. Modificarea afișajelor unei mașini poate distrage
> șoferul, poate produce defecte și poate încălca reglementările locale. Folosirea este pe propriul risc.
> Testează întotdeauna cu mașina parcată.

# RNZALI Cluster

Layout-uri proprii pentru instrumentarul de bord BMW iDrive 7 (MGU, cluster-ul Live Cockpit Professional de 12,3"),
**desenate chiar de cluster**: head unit-ul trimite doar shadere mici și valori, iar GPU-ul cluster-ului le
desenează. Aplicația: **RNZALI Cluster** (`rnzali_cluster`).

## Layout-uri

| Layout | Descriere |
|---|---|
| **Horizon** | Două arcuri deschise: viteza în stânga, cu cifrele mari în interior, și turația în dreapta, cu treapta jos și modul de condus sus. Între ele: ora, temperatura exterioară, puterea. Sub viteză: ulei și lichid de răcire. În dreapta cutiei KOMBI: autonomiile și încărcarea. Trei seturi de culori (comfort, sport, efficient) și trei centre (citiri, hartă, centrul original). |

| **RNZ Face** | Arcul de viteză din Horizon și, în mijloc, fața lui RNZ dintr-o fotografie, desenată de cluster: cu cât accelerezi mai tare (accelerația, cuplul motorului sau puterea bateriei), cu atât gura se deschide mai mult. Lângă zona roșie fața tremură și se înroșește, iar o sclipire trece peste ochelari la câteva secunde. Poza (`apps/rnzali_cluster/face_rnz.wad`, 200×276) se trimite o singură dată, ca textură. |

| **Manele Edition** | Tema 02: RNZ ca personaj de petrecere în mijlocul cluster-ului, cu capul din fotografie pe un corp desenat, totul desenat de cluster. **Accelerezi:** dansează pe manele, cu atât mai tare cu cât trage mașina; la maxim face dansul special și plouă cu bani. **Frânezi:** intră în panică, face ochii mari și îi cad pantalonii până la chiloții roșii cu inimioare; după frânare și-i trage la loc. **Semnalizezi:** brațul din partea aceea arată direcția și face cu mâna în ritmul semnalizării, iar dansul continuă. **Stă:** respiră, clipește, zâmbește strâmb și ridică din umeri din când în când. La turație mare e entuziasmat, la viteză mare e uimit. |

Mai multe urmează. Cum se scrie un layout: [apps/rnzali_cluster/README.md](apps/rnzali_cluster/README.md).

## Instalare din MGU Store

1. În [MGU Store](https://github.com/robertnisipeanu/mgu-store), adaugă ca sursă repository-ul GitHub
   `renzorlive/rnzali-cluster` (https://github.com/renzorlive/rnzali-cluster).
   Head unit-ul construiește aplicația din sursă, cu SDK-ul propriei unități.
2. Store-ul instalează automat ce îi trebuie aplicației, din sursele lui:
   `cluster-render` ≥ 0.4.2 (din [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps)),
   `idrive7-renderd` și `mgu-inputgate` (din [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)).
3. Deschide **RNZALI Cluster** și apasă **Show on the cluster**. Cluster-ul original revine singur când
   oprești afișarea, când aplicația sau serviciul de randare se oprește, sau când datele mașinii nu mai vin.

[eroobeeroo/idrive7-apps](https://github.com/eroobeeroo/idrive7-apps) (eDrive Live) este opțional: dă bateriei
puterea și încărcarea pe un plug-in hybrid.

**Nu instala în același timp și Cluster Layouts de la eroobeeroo:** ambele aplicații desenează pe tot panoul
(slotul 0x203) și își împart limita de straturi a serviciului de randare.

## Ce este verificat și ce nu

- **Verificat local** (Node.js, fără mașină): motorul, layout-urile, zonele pe care sticla și KOMBI le ascund,
  traficul trimis, plus compilarea shaderelor în WebGL 1 (Chromium, nu GPU-ul cluster-ului).
- **Netestat pe mașină** pentru RNZALI Cluster: conectarea la `cluster-render`, randarea pe GPU-ul KOMBI,
  martorii, mesajele Check Control, harta din centru, semnalele pe alte modele decât un G05. Verifică totul cu
  mașina parcată înainte să conduci cu el.

## Dezvoltare

Testele cer doar Node.js:

```sh
node kit/tools/test_runtime.js
for t in engine app data finder logs providers shared signals; do node tools/test_$t.js; done
```

(`test_logs` și `test_providers` rulează pe Linux: primul are nevoie de OpenCV, al doilea de `process.getuid`.)

- `node tools/preview.js --layout horizon --look sport --centre map --kmh --out preview.png` desenează un layout ca
  pe cluster (are nevoie de Playwright și Chromium).
- `node tools/clearance.js` listează ce piese ar sta sub zonele ascunse.
- După orice modificare în `shared/`, rulează `node tools/sync_shared.js`.
- `python3 kit/tools/build.py rnzali_cluster` construiește pachetul în `dist/`. Are nevoie de `oap-sdk/` de BMW,
  extras de pe propria unitate. Nu se publică niciodată, la fel ca pachetele construite.

## Structură

| Cale | Ce conține |
|---|---|
| `apps/rnzali_cluster/` | aplicația: `main.js`, `layouts.js`, `layout_common.js`, `layout_*.js` (layout-urile noastre), `app.json` (manifest, semnale, setări) și copia fișierelor din `shared/` |
| `shared/` | motorul cluster-ului și shaderele, datele mașinii, fonturile, ceasul, logurile |
| `kit/` | runtime-ul aplicației și build-ul (MGU App Kit) |
| `tools/` | teste, previzualizare, verificarea zonelor ascunse, generatorul de font |
| `mgu-repo.json` | îi spune MGU Store cum să construiască aplicațiile |

## Licență

Copyright (C) 2026 RNZALI. GPL-3.0-or-later ([LICENSE](LICENSE)). Proiectul pornește de la
[eroobeeroo/idrive7-cluster-info](https://github.com/eroobeeroo/idrive7-cluster-info) (Cluster Layouts,
Copyright (C) 2026 eroobeeroo, GPL-3.0-or-later): motorul, datele mașinii și ecranul aplicației sunt ale lui,
layout-urile din `apps/rnzali_cluster/layout_*.js` sunt ale noastre. Părțile cu alte licențe: [NOTICE.md](NOTICE.md).
