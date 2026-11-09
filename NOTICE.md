# Notices

RNZALI Cluster, Copyright (C) 2026 RNZALI, GPL-3.0-or-later (`LICENSE`).

It is a modified version of [eroobeeroo/idrive7-cluster-info](https://github.com/eroobeeroo/idrive7-cluster-info)
(Cluster Layouts and its shared engine), Copyright (C) 2026 eroobeeroo, GPL-3.0-or-later. Changes, 2026-11-09:
- the app was renamed to `rnzali_cluster`;
- eroobeeroo's layouts, Cluster Centre and Cluster Info were removed;
- our own layouts were added (`apps/rnzali_cluster/layout_*.js`);
- the signed credit was replaced by a GPL notice on the app's screen;
- the tools and tests were pointed at the new app.

The upstream history is kept in this repository's git log.

- `kit/` is the MGU App Kit from
  [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) (through
  eroobeeroo/idrive7-apps), MIT licence: `kit/LICENSE`, `LICENSE-MIT`. Its fonts keep their own licences
  (`kit/runtime/fonts`). The kit's Chinese translation credit is in `NOTICE.zh-CN.md`.
- `cluster_render_client.js` (in `shared/` and the app) is the cluster render service's Node client from
  [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps) (`native/cluster-render`), MPL-2.0,
  as its header says.
- BMW's `oap-sdk` is not part of this repository. Each head unit builds the app with its own copy.

## Barlow Semi Condensed (the cluster font)

The cluster glyph atlases (`shared/font_bold.wad`, `shared/font_light.wad`, made by `tools/bake_font.py`) are
drawn from Barlow Semi Condensed, Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow),
used under the SIL Open Font License 1.1. The licence's full text ships with the app as `NOTICE`
(`shared/NOTICE`).
