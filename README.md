# Apple Health Card

A Home Assistant Lovelace card with an Apple Health–style layout, built for the health sensors that the **Home Assistant Companion app for iOS** creates from Apple Health.

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories)
[![Validate](https://github.com/riccardoq76/apple-health-card/actions/workflows/validate.yml/badge.svg)](https://github.com/riccardoq76/apple-health-card/actions/workflows/validate.yml)

<p align="center">
  <img src="images/card-desktop.png" alt="Apple Health Card, light theme" width="560">
  <img src="images/card-mobile.png" alt="Apple Health Card on a phone" width="200">
</p>

<details>
<summary>Dark theme</summary>
<p align="center"><img src="images/card-dark.png" alt="Apple Health Card, dark theme" width="560"></p>
</details>

<sub>Screenshots use demo values, not real health data.</sub>

> The card's labels are in **Italian** (e.g. *Passi*, *Sonno*, *Frequenza cardiaca*). Translations are welcome as pull requests.

## What it shows

- **Activity rings**: Move (active energy), Exercise (exercise minutes), Steps, each with a configurable goal.
- **Activity**: walking + running distance, flights climbed, resting energy, VO2 max.
- **Heart and breathing**: heart rate, resting heart rate, walking heart rate average, HRV, blood oxygen, respiratory rate.
- **Sleep**: last night's total with a stage bar (awake, REM, core, deep).
- **Body**: weight, body fat, lean body mass, water.

Every tile shows **how old its value is** ("12 min ago", "yesterday"). Health data does not stream live: it reaches Home Assistant only when the iPhone syncs, so a "current" heart rate can be hours or days old. Values older than `stale_hours` are marked with ⚠ and dimmed. Body metrics (weight, body fat, lean mass, VO2 max) are never marked, since they change rarely.

Tiles whose sensor is missing or `unavailable` are hidden. Tapping a tile opens Home Assistant's standard history dialog.

## Requirements

- Home Assistant (tested on 2026.9 with a **sections** dashboard).
- Home Assistant **Companion app for iOS** with the Health sensors enabled (Companion app → Settings → Sensors). Tested with sensors named `sensor.<device>_heart_rate`, `sensor.<device>_health_steps`, `sensor.<device>_sleep_duration` and so on.
- The Android app uses Health Connect with **different sensor names**: it may work by mapping them with `entities:`, but it has not been tested.

## Installation

### HACS (custom repository)

1. HACS → three dots (top right) → **Custom repositories**.
2. Repository: `https://github.com/riccardoq76/apple-health-card`, type: **Dashboard**.
3. Find **Apple Health Card** in HACS and download it.
4. Reload the browser (Cmd/Ctrl + Shift + R). In the Companion app: Settings → Debug → Reset frontend cache.

### Manual

1. Copy `dist/apple-health-card.js` to `/config/www/apple-health-card.js`.
2. Settings → Dashboards → three dots → **Resources** → Add resource:
   URL `/local/apple-health-card.js?v=2.0.0`, type **JavaScript module**.
   Change the `?v=` number every time you replace the file, otherwise phones keep the cached copy.
3. Reload the browser.

## Configuration

Minimal:

```yaml
type: custom:apple-health-card
prefix: iphone
```

`prefix` is the part between `sensor.` and the metric name. If your sensors are called `sensor.my_iphone_heart_rate`, the prefix is `my_iphone`.

All options:

| Option | Default | Description |
|---|---|---|
| `prefix` | — | Companion app sensor prefix. Required unless every metric is set in `entities`. |
| `title` | `Salute` | Card title. |
| `entities` | — | Map of metric → entity_id. Overrides the prefix for that metric. |
| `goals` | see below | Ring goals: `active_energy` (500 kcal), `exercise` (30 min), `steps` (10000). |
| `stale_hours` | `12` | After how many hours a value is marked as old. |
| `hide_missing` | `true` | Hide tiles whose sensor is missing or unavailable. |

Full example:

```yaml
type: custom:apple-health-card
title: Salute
prefix: iphone
stale_hours: 24
goals:
  active_energy: 400
  exercise: 45
  steps: 8000
entities:
  weight: sensor.smart_scale_weight
```

### Metric keys and default sensors

| Key | Default entity (`sensor.<prefix>_…`) |
|---|---|
| `active_energy` | `active_energy` |
| `exercise` | `exercise_time` |
| `steps` | `health_steps` |
| `distance` | `walking_running_distance` |
| `flights` | `flights_climbed` |
| `resting_energy` | `resting_energy` |
| `vo2max` | `vo2_max` |
| `heart_rate` | `heart_rate` |
| `resting_heart_rate` | `resting_heart_rate` |
| `walking_heart_rate` | `walking_heart_rate_average` |
| `hrv` | `heart_rate_variability` |
| `spo2` | `blood_oxygen` |
| `respiratory_rate` | `respiratory_rate` |
| `weight` | `weight` |
| `body_fat` | `body_fat_percentage` |
| `lean_mass` | `lean_body_mass` |
| `water` | `water` |
| `sleep` | `sleep_duration` |
| `sleep_awake` | `awake` |
| `sleep_rem` | `rem_sleep` |
| `sleep_core` | `core_sleep` |
| `sleep_deep` | `deep_sleep` |

## Trend charts

The card shows current values only. For trends, see [`examples/dashboard.yaml`](examples/dashboard.yaml): a two-view dashboard (today + trends) that uses native statistics graphs and [apexcharts-card](https://github.com/RomRider/apexcharts-card).

Why the sleep and heart charts do not use daily statistics: since data arrives only when the iPhone syncs, a daily statistic repeats the previous night on days without a sync, and mixes two nights on the day a new value arrives. The example uses raw history grouped by day instead, which is limited by the recorder retention (10 days by default).

## Privacy

This card only reads states that the current Home Assistant user can already see. It makes no network requests and writes nothing.

Health data is sensitive. Consider putting the card on a dashboard restricted to administrators (dashboard settings → *Admin only*), not on a shared wall tablet, and check that the health sensors are not exposed to voice assistants or to the HomeKit bridge.

## License

[MIT](LICENSE)
