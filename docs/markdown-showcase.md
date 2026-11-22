# Aurora

> A tiny library for reading the sky.
> *"The best telescope is the one you have with you."*

[![build](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![npm](https://img.shields.io/badge/npm-v2.1.0-blue)](#)
[![license](https://img.shields.io/badge/license-MIT-lightgrey)](#)

---

## Install

```bash
npm install aurora
```

## Quick start

```ts
import { sky } from "aurora";

const tonight = await sky.at({ lat: 60.17, lon: 24.94 });

if (tonight.kpIndex > 5) {
  console.log(`Look north — Kp ${tonight.kpIndex}`);
}
```

## Why

| | Aurora | The other one |
|---|:---:|:---:|
| Bundle size | **4 kB** | 190 kB |
| Dependencies | **0** | 27 |
| Offline mode | ✅ | ❌ |
| Types | ✅ | partial |

## Concepts

Aurora has exactly three ideas.

1. **Observers** — a place and a time.
2. **Forecasts** — what the sky will do there.
3. **Alerts** — a callback when it does.

Everything else is a helper you can delete.

### Observers

An observer is a plain object. There is no class, no builder, no factory:

```ts
const helsinki = { lat: 60.17, lon: 24.94, tz: "Europe/Helsinki" };
```

### Forecasts

<details>
<summary>Full response shape</summary>

```json
{
  "kpIndex": 6.3,
  "cloudCover": 0.12,
  "window": ["2025-01-14T21:00Z", "2025-01-15T02:00Z"],
  "confidence": "high"
}
```

</details>

### Alerts

```ts
sky.watch(helsinki, (f) => notify(`Kp ${f.kpIndex}`), { min: 5 });
```

> [!NOTE]
> Alerts poll every 15 minutes. Upstream data refreshes hourly, so
> polling faster only costs you rate limit.

> [!WARNING]
> `sky.watch` keeps a timer alive. Call the returned `stop()` in tests,
> or your test runner will hang and you will blame the test runner.

## API

| Function | Returns | Notes |
|---|---|---|
| `sky.at(observer)` | `Promise<Forecast>` | Cached for 5 min |
| `sky.watch(observer, cb, opts?)` | `() => void` | Returns `stop()` |
| `sky.history(observer, days)` | `Promise<Forecast[]>` | Max 30 days |

## Roadmap

- [x] Kp index forecasts
- [x] Cloud cover overlay
- [ ] Moon phase weighting
- [ ] Offline tile cache

## Contributing

Small pull requests, please. If the diff needs a diagram, it needs to be
two pull requests.

---

<sub>MIT © 2025 Aurora contributors · [docs](#) · [changelog](#)</sub>
