import csv
import io
import math
import statistics
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

SAMPLE_CSV_PATH = 'sample_gold_data.csv'

# --- Normalization factors ---
NORM_FACTORS = {
    'goldm': 1.0,
    'goldten': 1.0,
    'goldguinea': 1.25,  # 8g contract -> per 10g
    'goldpetal': 10.0,   # 1g contract -> per 10g
}

CONTRACT_KEYS = ['goldm', 'goldten', 'goldguinea', 'goldpetal']
VOLUME_KEYS   = ['goldm_vol', 'goldten_vol', 'goldguinea_vol', 'goldpetal_vol']

CSV_REQUIRED_COLS = {'Date', 'GOLDM', 'GOLDTEN', 'GOLDGUINEA', 'GOLDPETAL',
                     'GOLDM_Volume', 'GOLDTEN_Volume', 'GOLDGUINEA_Volume', 'GOLDPETAL_Volume'}


def parse_csv_rows(file_obj):
    """
    Parse CSV file object into a list of raw dicts.
    Returns (rows, error_msg). error_msg is None on success.
    """
    try:
        reader = csv.DictReader(file_obj)
        missing = CSV_REQUIRED_COLS - set(reader.fieldnames or [])
        if missing:
            return None, f"Missing columns: {', '.join(sorted(missing))}"
        rows = []
        for i, row in enumerate(reader, start=2):  # row 1 = header
            try:
                rows.append({
                    'date': row['Date'].strip(),
                    'goldm':     float(row['GOLDM']),
                    'goldten':   float(row['GOLDTEN']),
                    'goldguinea': float(row['GOLDGUINEA']) * 1.25,
                    'goldpetal': float(row['GOLDPETAL']) * 10.0,
                    'goldm_vol':     float(row['GOLDM_Volume']),
                    'goldten_vol':   float(row['GOLDTEN_Volume']),
                    'goldguinea_vol':float(row['GOLDGUINEA_Volume']),
                    'goldpetal_vol': float(row['GOLDPETAL_Volume']),
                })
            except ValueError as e:
                return None, f"Bad numeric value on row {i}: {e}"
        if len(rows) < 3:
            return None, "Need at least 3 data rows."
        return rows, None
    except Exception as e:
        return None, f"Could not read CSV: {e}"


def load_sample_data():
    """Load and parse the default sample CSV from disk."""
    with open(SAMPLE_CSV_PATH, mode='r', encoding='utf-8') as f:
        rows, err = parse_csv_rows(f)
    if err:
        raise RuntimeError(f"Sample data error: {err}")
    return rows


def compute_analysis(rows, contract_a='goldm', contract_b='goldten',
                     threshold=2.0, min_volume=1000.0, rolling_window=None):
    """
    Given parsed rows and user-chosen parameters, return processed data + analysis dict.
    contract_a, contract_b: keys from CONTRACT_KEYS
    threshold: z-score anomaly trigger
    min_volume: minimum GOLDM volume for liquidity check
    rolling_window: int or None (None = full history)
    """
    # Attach spread for the chosen pair
    processed = []
    for r in rows:
        spread = round(r[contract_a] - r[contract_b], 2)
        processed.append({**r,
                          'spread': spread,
                          'goldm': round(r['goldm'], 2),
                          'goldten': round(r['goldten'], 2),
                          'goldguinea': round(r['goldguinea'], 2),
                          'goldpetal': round(r['goldpetal'], 2),
                          })

    # Historical = everything except the last row
    latest = processed[-1]
    historical = processed[:-1]

    # Rolling window selection
    if rolling_window and rolling_window > 0:
        window = max(2, rolling_window)
        historical_window = historical[-window:]
    else:
        historical_window = historical

    hist_spreads = [r['spread'] for r in historical_window]
    hist_mean = statistics.mean(hist_spreads)
    hist_std  = statistics.pstdev(hist_spreads) if len(hist_spreads) > 1 else 1.0
    if hist_std == 0:
        hist_std = 1.0

    latest_spread = latest['spread']
    z_score = (latest_spread - hist_mean) / hist_std

    # Volume for chosen contract_a (fall back to goldm_vol if unavailable)
    vol_key = contract_a + '_vol'
    latest_volume = latest.get(vol_key, latest.get('goldm_vol', 0))
    liquidity_passed = latest_volume >= min_volume

    is_anomaly = abs(z_score) >= threshold
    status = "Investigate" if (is_anomaly and liquidity_passed) else "Normal"

    # --- Question It checks ---
    # 1. Persistence: was the previous day also above threshold?
    if len(historical) >= 1:
        prev_spread = historical[-1]['spread']
        prev_z = (prev_spread - hist_mean) / hist_std
        persistence = abs(prev_z) >= threshold
    else:
        persistence = False

    # 2. Volume check vs recent average (last 10 hist rows)
    recent_vols = [r.get(vol_key, r.get('goldm_vol', 0)) for r in historical[-10:]]
    avg_vol = statistics.mean(recent_vols) if recent_vols else min_volume
    vol_normal = latest_volume >= 0.75 * avg_vol  # within 25% of avg is normal

    # 3. Data error check (>10 sigma or >1% price jump in either contract)
    latest_price_a = latest[contract_a]
    prev_price_a = historical[-1][contract_a] if historical else latest_price_a
    pct_jump = abs(latest_price_a - prev_price_a) / prev_price_a * 100 if prev_price_a else 0
    data_error = abs(z_score) > 10 or pct_jump > 1.0

    # 4. Cross-check: do other contracts move together?
    other_contracts = [k for k in CONTRACT_KEYS if k not in (contract_a, contract_b)]
    cross_confirm = False
    for oc in other_contracts:
        oc_prev = historical[-1][oc] if historical else None
        oc_now  = latest[oc]
        if oc_prev and abs(oc_now - oc_prev) / oc_prev * 100 > 0.3:
            cross_confirm = True
            break

    # Build Question It items
    checks = [
        {
            'label': 'Persistence',
            'status': 'PASS' if persistence else 'WARN',
            'note': ('Spread was above threshold on the previous day too — signal persists.'
                     if persistence
                     else 'One-day spike only; treat with extra caution.')
        },
        {
            'label': 'Volume',
            'status': 'PASS' if vol_normal else 'WARN',
            'note': (f'Volume ({int(latest_volume):,}) is near the recent average ({int(avg_vol):,}) — liquidity is normal.'
                     if vol_normal
                     else f'Volume ({int(latest_volume):,}) is unusually low vs recent average ({int(avg_vol):,}).')
        },
        {
            'label': 'Data Error Check',
            'status': 'FAIL' if data_error else 'PASS',
            'note': (f'Move may be implausible: z={abs(z_score):.1f}σ or price jump {pct_jump:.2f}% — verify source data.'
                     if data_error
                     else f'Z-score ({abs(z_score):.1f}σ) and price jump ({pct_jump:.2f}%) are within plausible bounds.')
        },
        {
            'label': 'Cross-Contract Check',
            'status': 'PASS' if cross_confirm else 'WARN',
            'note': ('Other contracts (GOLDGUINEA / GOLDPETAL) show a similar move — broader market signal.'
                     if cross_confirm
                     else 'Other contracts did not move meaningfully — could be an isolated data issue.')
        },
        {
            'label': 'Expiry / Roll Note',
            'status': 'WARN',
            'note': 'Contract expiry or roll-over can cause artificial spreads. Verify upcoming MCX expiry dates.'
        },
    ]

    pass_count = sum(1 for c in checks if c['status'] == 'PASS')
    total = len(checks)
    if pass_count >= 4:
        confidence = f"{pass_count} of {total} checks passed — moderate confidence in signal."
    elif pass_count >= 2:
        confidence = f"{pass_count} of {total} checks passed — treat with caution."
    else:
        confidence = f"{pass_count} of {total} checks passed — signal is weak; further verification needed."

    # Conclusion text
    a_label = contract_a.upper()
    b_label = contract_b.upper()
    dir_word = "above" if latest_spread > 0 else "below"
    conclusion = (
        f"The latest normalized {a_label}–{b_label} spread ({latest_spread:+,.2f} INR) is "
        f"materially {dir_word} the {'rolling' if rolling_window else 'full'} historical mean "
        f"({hist_mean:+,.2f} INR, z-score: {z_score:+.2f}σ). "
        "AURIX has flagged this for further research. It does not recommend a trade."
        if is_anomaly else
        f"The latest normalized {a_label}–{b_label} spread ({latest_spread:+,.2f} INR) is "
        f"within normal bounds relative to the {'rolling' if rolling_window else 'full'} historical mean "
        f"({hist_mean:+,.2f} INR, z-score: {z_score:+.2f}σ). No anomaly detected."
    )

    analysis = {
        'latest_date':            latest['date'],
        'contract_a':             contract_a,
        'contract_b':             contract_b,
        'contract_a_label':       a_label,
        'contract_b_label':       b_label,
        'latest_price_a':         round(latest[contract_a], 2),
        'latest_price_b':         round(latest[contract_b], 2),
        'latest_spread':          round(latest_spread, 2),
        'historical_mean_spread': round(hist_mean, 2),
        'historical_std_spread':  round(hist_std, 2),
        'z_score':                round(z_score, 2),
        'threshold':              threshold,
        'latest_volume':          latest_volume,
        'min_volume_threshold':   min_volume,
        'liquidity_passed':       liquidity_passed,
        'is_anomaly':             is_anomaly,
        'status':                 status,
        'conclusion':             conclusion,
        'checks':                 checks,
        'confidence':             confidence,
        'rolling_window':         rolling_window,
        # Spread series for frontend chart
        'spread_series':          [r['spread'] for r in processed],
        'dates':                  [r['date'] for r in processed],
        'upper_band':             round(hist_mean + threshold * hist_std, 2),
        'lower_band':             round(hist_mean - threshold * hist_std, 2),
    }

    return processed, analysis


@app.route('/')
def index():
    """Serve main page with initial server-side render."""
    rows = load_sample_data()
    data, analysis = compute_analysis(rows)
    return render_template('index.html', data=data, analysis=analysis)


@app.route('/api/data', methods=['GET'])
def api_data():
    """
    Return processed data + analysis as JSON.
    Query params:
      contract_a, contract_b (goldm/goldten/goldguinea/goldpetal)
      threshold (float, default 2.0)
      min_volume (float, default 1000)
      rolling_window (int, default 0 = full history)
    """
    contract_a    = request.args.get('contract_a', 'goldm').lower()
    contract_b    = request.args.get('contract_b', 'goldten').lower()
    threshold     = float(request.args.get('threshold', 2.0))
    min_volume    = float(request.args.get('min_volume', 1000.0))
    rolling_window = int(request.args.get('rolling_window', 0)) or None

    if contract_a not in CONTRACT_KEYS or contract_b not in CONTRACT_KEYS:
        return jsonify({'error': 'Invalid contract key'}), 400
    if contract_a == contract_b:
        return jsonify({'error': 'Contracts must be different'}), 400

    rows = load_sample_data()
    data, analysis = compute_analysis(rows, contract_a, contract_b,
                                      threshold, min_volume, rolling_window)
    return jsonify({'data': data, 'analysis': analysis})


@app.route('/api/upload', methods=['POST'])
def api_upload():
    """Accept a user-uploaded CSV, validate, and return computed analysis."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file field in request.'}), 400
    f = request.files['file']
    if not f.filename.endswith('.csv'):
        return jsonify({'error': 'File must be a .csv'}), 400

    stream = io.StringIO(f.stream.read().decode('utf-8'))
    rows, err = parse_csv_rows(stream)
    if err:
        return jsonify({'error': err}), 422

    contract_a    = request.form.get('contract_a', 'goldm').lower()
    contract_b    = request.form.get('contract_b', 'goldten').lower()
    threshold     = float(request.form.get('threshold', 2.0))
    min_volume    = float(request.form.get('min_volume', 1000.0))
    rolling_window = int(request.form.get('rolling_window', 0)) or None

    data, analysis = compute_analysis(rows, contract_a, contract_b,
                                      threshold, min_volume, rolling_window)
    return jsonify({'data': data, 'analysis': analysis})


@app.route('/api/sample', methods=['GET'])
def api_sample():
    """Return raw sample CSV data as JSON (for Reset to Sample Data button)."""
    rows = load_sample_data()
    return jsonify({'rows': rows})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
