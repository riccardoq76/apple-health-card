# Changelog

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
