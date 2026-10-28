# AURIX

## Commodity Relationship Intelligence for MCX Gold Contracts

**Don't just find the signal. Question it.**

[Open the AURIX dashboard](https://aurix-r2e7.onrender.com/)

> **Research prototype only. Not financial advice.** AURIX identifies unusual relative-price divergences between related contracts and flags them for further research. It does not recommend or execute trades.

All bundled data is synthetic and illustrative. It is not real MCX market data.

## Overview

MCX gold futures can represent the same underlying commodity while using different contract sizes, quotation bases, and specifications. Comparing GOLDM, GOLDTEN, GOLDGUINEA, and GOLDPETAL directly can therefore be misleading.

AURIX converts contract prices to a common INR-per-10-gram basis, measures relative spreads, detects statistically unusual movements, and applies validation checks before presenting a divergence for investigation.

The goal is to help researchers ask whether an observed divergence may be meaningful or could instead reflect noise, low liquidity, data quality, contract specifications, or expiry and rollover effects.

## How the analysis works

1. **Normalize** contract prices to a common basis.
2. **Validate** dates, prices, volumes, and available observations.
3. **Detect** unusual relative-price movements using spread and z-score analysis.
4. **Compare** related contracts for corroborating movement.
5. **Question the signal** with persistence, volume, data-error, cross-contract, and expiry/roll checks.

The result is an explainable research flag, not a trading instruction. AURIX does not label a divergence as a buy or sell signal.

## Validation checks

- **Persistence:** Checks whether an unusual spread continues across multiple observations or appears as a one-day spike.
- **Volume:** Shows whether the observation has reasonable volume support.
- **Data error:** Flags implausible moves, including extreme z-scores or sharp price jumps.
- **Cross-contract consistency:** Checks whether other related contracts show a compatible movement.
- **Expiry and rollover context:** Highlights contract lifecycle effects that may distort apparent relationships.

These checks provide context for further research; they do not establish that a divergence is valid or actionable.

## Data input

AURIX supports CSV uploads with the following columns:

```csv
date,GOLDM,GOLDTEN,GOLDGUINEA,GOLDPETAL,volume
2026-01-02,7240,7230,7235,7228,5200
2026-01-03,7244,7235,7239,7232,6100
```

| Column | Description |
| --- | --- |
| `date` | Trading date |
| `GOLDM` | Gold Mini price |
| `GOLDTEN` | Gold Ten price |
| `GOLDGUINEA` | Gold Guinea price |
| `GOLDPETAL` | Gold Petal price |
| `volume` | Volume observation |

Uploaded files are checked for required columns, valid dates, numeric prices, valid volume values, and sufficient observations. The dashboard can be reset to its bundled sample data.

## Technology

- **Backend:** Python and Flask
- **Analysis:** Pandas and NumPy
- **Frontend:** HTML, CSS, and JavaScript
- **Charts:** Chart.js
- **Input format:** CSV
- **Hosting:** Render

## Project structure

```text
AURIX/
├── app.py
├── sample_gold_data.csv
├── requirements.txt
├── README.md
├── static/
│   ├── css/style.css
│   └── js/app.js
└── templates/
    └── index.html
```

## Deployment

The application is configured for deployment as a Flask web service.

**Build command**

```bash
pip install -r requirements.txt
```

**Start command**

```bash
gunicorn app:app
```

## Research and data disclaimer

AURIX is a hackathon research prototype. Its bundled dataset is synthetic and illustrative and does not represent actual MCX market prices.

AURIX does not predict gold prices, execute trades, provide financial advice, recommend buying or selling, or guarantee that an anomaly represents an opportunity. A detected divergence is only a prompt for further research.

## Team CODEX404

- **Bhoomika Pinto:** Data and Analytics
- **Laveesha Dsouza:** Backend, Frontend, and Integration

Developed for **Hack in Hills '26**, Track 03: Commodity Derivatives Intelligence.

---

**Normalize. Detect. Validate. Question. Research.**
