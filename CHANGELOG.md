# Changelog

## 2.5.0 — 2026-10-09

- **New card `custom:apple-health-trends`**, in the same file: the trends page as a card, in the style of the main card. Sleep (total and stages), resting heart rate and HRV (daily average), steps, active energy, exercise minutes, weight and VO2 max. Tap a bar or a point to see its value. No apexcharts-card needed. Options: `days`, `body_days`, `weight_range`, `goals`, `hide`, `title`. English, Italian, Spanish and German.
- Wide screens: sections in two columns (put the card in a section with `column_span: 2`). Phones: stacked.
- Line charts: the vertical scale follows the data (HRV is no longer drawn on a 0–100 axis).
- The main card is unchanged. The example dashboard with apexcharts-card is still available; a new example uses the two cards (`examples/dashboard-trends.yaml`).

## 2.4.1 — 2026-10-09

- Mini charts: the vertical scale now has a minimum range (10% of the average value). Before, a tiny change (for example 65.2 → 65.1 kg) filled the whole height and looked like a big drop.
- The version number is now shown at the bottom of the visual editor.

## 2.4.0 — 2026-10-09

- **Spanish and German translations**, contributed by @agarridob and @Kununa. The card now speaks English, Italian, Spanish and German. The language selector of the visual editor has all four.
- **New `sparklines` option**: a small chart of the last 7 days inside the tiles (`true` for sleep, resting heart rate, HRV and weight, or a list of metrics). It reads the raw history from Home Assistant at most every 10 minutes and the card works without it if the request fails. Off by default.
- **`averages` supports more metrics**: walking heart rate, respiratory rate and blood oxygen, besides sleep, resting heart rate and HRV. Steps and active energy are not supported on purpose (they are growing counters, so the comparison would be misleading).
- README: new sections on mini charts and units (nothing to configure: Home Assistant already gives the values in your unit system).
- Without the new options nothing changes.

## 2.3.0 — 2026-10-09

- Weight, body fat, lean mass, water and VO2 max: the "x ago" label now counts from the last time the value *changed*. The Companion app can resend the same value several times, which made an old weighing look new. After a Home Assistant restart the label restarts from the first update.
- New `hide` option: list of metrics to hide (`[water, lean_mass]`, also `steps`, `exercise`, `active_energy` for the rings and `sleep` for the sleep block). The rings resize when some are hidden.
- New optional `goals.sleep` (hours): shows last night's sleep as a percentage of the goal. Nothing is shown unless you set it.
- Without the new options only the weight age label changes.

## 2.2.0 — 2026-10-01

- English translation. The card now follows the language of Home Assistant (`language: auto`): Italian and English are included, any other language falls back to English. New `language` option (also in the visual editor) to force `it` or `en`. Numbers and dates use the format of that language.
- The default title is now translated ("Salute" / "Health") unless you set `title:`. If your Home Assistant is in English and you want to keep Italian, add `language: it`.
- Tiles: the "x min ago" label is now anchored to the bottom of each tile, so it lines up across a row even when some tiles show the 7-day comparison line and others do not.

## 2.1.0 — 2026-10-01

- New optional `averages` option: shows the difference from a 7-day average under sleep, resting heart rate and HRV. The averages come from Home Assistant Statistics helpers (see README).
- New `min_coverage` option (default 0.5): the difference is hidden while the average covers too few days.
- The card also re-renders when one of the average sensors changes.
- Without `averages` nothing changes.

## 2.0.1 — 2026-09-29

- Sleep legend on wide screens: each value now sits next to its label instead of being pushed to the far right. Phone layout unchanged.

## 2.0.0 — 2026-09-29

First public release.

- Entities are built from a fixed `prefix` (e.g. `iphone` → `sensor.iphone_heart_rate`) or set one by one with `entities:`. No more fuzzy auto-detection across all sensors.
- Every tile shows how old its value is, and flags values older than `stale_hours` (default 12 h). Body metrics (weight, body fat, lean mass, VO2 max) are never flagged, since they update rarely.
- Activity rings: Move (active energy), Exercise (exercise time), Steps (`health_steps`).
- New sections: sleep with stage breakdown (awake, REM, core, deep), VO2 max, resting energy, walking heart rate, lean body mass, water.
- Re-renders only when one of the card's own sensors changes.
- Uses Home Assistant theme colors (works in dark mode). Styles isolated in shadow DOM.
- All values are escaped before being written to the page.
- Visual editor for title, prefix, ring goals and stale threshold.
