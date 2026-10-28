# AURIX — Commodity Relationship Intelligence Engine

> **Research prototype only. Not financial advice. Flagged signals are for further research only.**

AURIX is a hackathon prototype that investigates relative-price divergences between related MCX gold futures contracts (GOLDM, GOLDTEN, GOLDGUINEA, GOLDPETAL) using a Python Flask backend and a vanilla HTML/CSS/JS frontend.

All data shipped with this repo is **synthetic and illustrative**. It is not real MCX market data.

---

## Features

| Feature | Description |
|---|---|
| Normalized price comparison | All contracts converted to INR / 10 grams for fair comparison |
| Spread over time chart | Shows historical spread with mean, ±sigma bands, and anomaly highlights |
| Interactive controls | Pick any pair of contracts; adjust z-score threshold, min volume, rolling window |
| CSV upload | Upload your own CSV in the same format; validates missing columns and bad values |
| "Question It" panel | 5 sanity checks (persistence, volume, data error, cross-check, expiry note) with PASS/WARN/FAIL badges |
| Live recompute | Everything updates without a page reload |

---

## How to Run

### 1. Prerequisites

- Python 3.9+ installed
- pip

### 2. Clone / navigate to project

```bash
cd path/to/AURIX
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

`requirements.txt` contains:
```
flask
```

### 4. Start the Flask development server

```bash
python app.py
```

The app will start at **http://127.0.0.1:5000**.

---

## Project Structure

```
AURIX/
├── app.py                    # Flask backend — routes, data processing, analysis
├── sample_gold_data.csv      # 30-day synthetic gold futures dataset
├── requirements.txt
├── README.md
├── static/
│   ├── css/style.css         # Dark-theme styles, controls, charts, panels
│   └── js/app.js             # Chart.js rendering, controls wiring, CSV upload
└── templates/
    └── index.html            # Jinja template — all UI panels
```

---

## CSV Upload Format

Your uploaded CSV must have these columns (header-sensitive):

```
Date,GOLDM,GOLDTEN,GOLDGUINEA,GOLDPETAL,GOLDM_Volume,GOLDTEN_Volume,GOLDGUINEA_Volume,GOLDPETAL_Volume
```

- `Date`: any parseable date string (YYYY-MM-DD recommended)
- `GOLDM`, `GOLDTEN`: price in INR per 10 grams
- `GOLDGUINEA`: price in INR per 8 grams (internally scaled ×1.25)
- `GOLDPETAL`: price in INR per 1 gram (internally scaled ×10)
- `*_Volume`: number of units traded

Minimum 3 data rows required. Use "Reset to Sample" to revert to the built-in dataset.

---

## Key API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Renders main dashboard (server-side initial data) |
| `/api/data` | GET | Returns JSON analysis; accepts query params: `contract_a`, `contract_b`, `threshold`, `min_volume`, `rolling_window` |
| `/api/upload` | POST | Accepts multipart CSV + form params; validates and returns analysis |
| `/api/sample` | GET | Returns raw sample CSV rows as JSON |

---

## Methodology

1. **Normalize** — Convert all contracts to INR per 10 grams.
2. **Detect** — Compute spread: `Spread_t = Price_A_t − Price_B_t`.
3. **Validate** — Compute z-score: `|(Spread_t − μ) / σ| ≥ threshold` (default 2.0σ).
4. **Filter** — Confirm baseline liquidity: Contract A volume ≥ min volume filter.
5. **Question It** — Run 5 sanity checks to assess signal reliability.

AURIX **never recommends a trade**. Any flagged anomaly is marked for further research only.

---

## Team

**CODEX404**
