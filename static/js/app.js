/**
 * AURIX — Commodity Relationship Intelligence Engine
 * Frontend controller: manages Chart.js charts, interactive controls,
 * CSV upload/reset, and the "Question It" sanity-check panel.
 *
 * Depends on:
 *   - Chart.js (loaded via CDN in index.html)
 *   - SEED_DATA and SEED_ANALYSIS globals injected by Flask/Jinja
 */

/* ─── State ─────────────────────────────────────────────────────────────── */
let currentData = SEED_DATA;
let currentAnalysis = SEED_ANALYSIS;
let uploadedRows = null;   // null = use server sample; array = use uploaded data

/* ─── Chart instances ────────────────────────────────────────────────────── */
let priceChartInst = null;
let spreadChartInst = null;

/* ─── DOM refs ───────────────────────────────────────────────────────────── */
const contractAEl = document.getElementById('contractA');
const contractBEl = document.getElementById('contractB');
const thresholdEl = document.getElementById('thresholdSlider');
const thresholdValEl = document.getElementById('thresholdVal');
const volumeEl = document.getElementById('volumeSlider');
const volumeValEl = document.getElementById('volumeVal');
const rollingEl = document.getElementById('rollingToggle');
const csvInputEl = document.getElementById('csvUploadInput');
const btnResetEl = document.getElementById('btnReset');
const uploadErrEl = document.getElementById('uploadError');

/* ─── Chart.js shared defaults ───────────────────────────────────────────── */
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = 'ui-monospace, monospace';
Chart.defaults.font.size = 11;

const GRID_COLOR = 'rgba(31,41,55,0.8)';
const TICK_COLOR = '#94a3b8';

/* ─────────────────────────────────────────────────────────────────────────── */
/*  RENDER FUNCTIONS                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

/** Build or update the main price comparison Chart.js line chart. */
function renderPriceChart(data) {
    const labels = data.map(d => d.date.slice(5));   // "MM-DD"
    const goldm = data.map(d => d.goldm);
    const goldten = data.map(d => d.goldten);
    const goldg = data.map(d => d.goldguinea);
    const goldp = data.map(d => d.goldpetal);

    const lastIdx = data.length - 1;
    // Highlight the last point on GOLDM with a larger radius
    const pointRadii = (arr) => arr.map((_, i) => i === lastIdx ? 5 : 2);

    const datasets = [
        { label: 'GOLDM', data: goldm, borderColor: '#d4af37', pointRadius: pointRadii(goldm), borderWidth: 2.5 },
        { label: 'GOLDTEN', data: goldten, borderColor: '#3b82f6', pointRadius: pointRadii(goldten), borderWidth: 2 },
        { label: 'GOLDGUINEA', data: goldg, borderColor: '#14b8a6', pointRadius: 2, borderWidth: 1.5 },
        { label: 'GOLDPETAL', data: goldp, borderColor: '#a855f7', pointRadius: 2, borderWidth: 1.5 },
    ].map(ds => ({ ...ds, fill: false, tension: 0.2, pointHoverRadius: 5 }));

    if (priceChartInst) {
        priceChartInst.data.labels = labels;
        priceChartInst.data.datasets = datasets;
        priceChartInst.update();
        return;
    }

    priceChartInst = new Chart(document.getElementById('priceChart'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },  // we use custom HTML legend
                tooltip: {
                    backgroundColor: '#111827',
                    borderColor: '#1f2937',
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                    }
                }
            },
            scales: {
                x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, maxRotation: 45 } },
                y: {
                    grid: { color: GRID_COLOR },
                    ticks: {
                        color: TICK_COLOR,
                        callback: v => '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })
                    }
                }
            }
        }
    });
}

/** Build or update the spread-over-time chart with mean and ±σ bands. */
function renderSpreadChart(data, analysis) {
    const labels = data.map(d => d.date.slice(5));
    const spreads = data.map(d => d.spread);
    const mean = analysis.historical_mean_spread;
    const upper = analysis.upper_band;
    const lower = analysis.lower_band;

    // Identify anomaly points (above upper or below lower)
    const pointColors = spreads.map(s =>
        Math.abs(s - mean) > Math.abs(upper - mean) ? '#ef4444' : '#d4af37'
    );
    const pointRadii = spreads.map(s =>
        Math.abs(s - mean) > Math.abs(upper - mean) ? 5 : 2
    );

    // Constant-line datasets as arrays of the same length
    const mk = (val) => data.map(() => val);

    const datasets = [
        {
            label: 'Spread',
            data: spreads,
            borderColor: '#d4af37',
            pointBackgroundColor: pointColors,
            pointRadius: pointRadii,
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            order: 1,
        },
        {
            label: 'Mean',
            data: mk(mean),
            borderColor: '#22c55e',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            borderDash: [],
            order: 2,
        },
        {
            label: `+${analysis.threshold}σ`,
            data: mk(upper),
            borderColor: '#ef4444',
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
            borderDash: [5, 4],
            order: 3,
        },
        {
            label: `-${analysis.threshold}σ`,
            data: mk(lower),
            borderColor: '#ef4444',
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
            borderDash: [5, 4],
            order: 4,
        },
    ];

    // Update spread chart title
    const titleEl = document.getElementById('spreadChartTitle');
    if (titleEl) {
        const aLabel = (analysis.contract_a_label || 'A').toUpperCase();
        const bLabel = (analysis.contract_b_label || 'B').toUpperCase();
        titleEl.textContent = `Spread Over Time: ${aLabel} − ${bLabel} (INR/10g)`;
    }

    if (spreadChartInst) {
        spreadChartInst.data.labels = labels;
        spreadChartInst.data.datasets = datasets;
        spreadChartInst.update();
        return;
    }

    spreadChartInst = new Chart(document.getElementById('spreadChart'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#94a3b8', boxWidth: 14, padding: 10, font: { size: 11 } }
                },
                tooltip: {
                    backgroundColor: '#111827',
                    borderColor: '#1f2937',
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, maxRotation: 45 } },
                y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR } }
            }
        }
    });
}

/** Populate all stat cards, badge, and conclusion text. */
function renderStats(analysis) {
    const a = analysis;

    // Spread label
    const spreadLabelEl = document.getElementById('spreadLabel');
    if (spreadLabelEl)
        spreadLabelEl.textContent = `Latest ${a.contract_a_label}–${a.contract_b_label} Spread`;

    // Metric cards
    setText('metricSpread', `${a.latest_spread >= 0 ? '+' : ''}${fmt(a.latest_spread)} INR`);
    setText('metricMean', `${a.historical_mean_spread >= 0 ? '+' : ''}${fmt(a.historical_mean_spread)} INR`);
    setText('metricZScore', `${a.z_score}σ`);

    const volEl = document.getElementById('metricVolume');
    if (volEl) {
        const passClass = a.liquidity_passed ? 'pass' : 'fail';
        volEl.className = `metric-value ${passClass}`;
        volEl.textContent = `${fmtInt(a.latest_volume)} units (${a.liquidity_passed ? 'PASS' : 'FAIL'})`;
    }

    // Status badge
    const badgeEl = document.getElementById('statusBadge');
    if (badgeEl) {
        badgeEl.textContent = a.status;
        badgeEl.className = `status-badge ${a.status.toLowerCase()}`;
    }

    // Conclusion
    setText('conclusionText', a.conclusion);

    // Dataset note
    const noteEl = document.getElementById('datasetNote');
    if (noteEl)
        noteEl.innerHTML = `Loaded from <code>sample_gold_data.csv</code> (or uploaded file). Displays ${currentData.length} historical daily observations. All statistics recomputed live when controls change.`;

    // Spread col header
    const spreadCol = document.getElementById('spreadColHeader');
    if (spreadCol) spreadCol.textContent = `Spread (${a.contract_a_label}−${a.contract_b_label})`;
}

/** Render the "Question It" checks list. */
function renderChecks(analysis) {
    const list = document.getElementById('checksList');
    if (!list) return;

    list.innerHTML = '';
    (analysis.checks || []).forEach(check => {
        const li = document.createElement('li');
        li.className = 'check-item';
        li.innerHTML = `
            <span class="check-badge ${check.status.toLowerCase()}">${check.status}</span>
            <div class="check-content">
                <div class="check-label">${escHtml(check.label)}</div>
                <div class="check-note">${escHtml(check.note)}</div>
            </div>
        `;
        list.appendChild(li);
    });

    setText('confidenceSummary', analysis.confidence || '—');

    // Confidence badge
    const cb = document.getElementById('confidenceBadge');
    if (cb) cb.textContent = analysis.confidence || '—';
}

/** Populate the data table. */
function renderTable(data, analysis) {
    const tbody = document.getElementById('dataTableBody');
    if (!tbody) return;

    const spreads = data.map(d => d.spread);
    const mean = analysis.historical_mean_spread;
    const upperBand = analysis.upper_band;
    const lowerBand = analysis.lower_band;
    const lastIdx = data.length - 1;

    tbody.innerHTML = '';
    data.forEach((row, i) => {
        const isLast = i === lastIdx;
        const isAnomaly = !isLast && (row.spread > upperBand || row.spread < lowerBand);
        const tr = document.createElement('tr');
        tr.className = isLast ? 'latest-row' : (isAnomaly ? 'anomaly-row' : '');
        tr.innerHTML = `
            <td>${row.date}</td>
            <td>${fmtInt(row.goldm)}</td>
            <td>${fmtInt(row.goldten)}</td>
            <td>${fmtInt(row.goldguinea)}</td>
            <td>${fmtInt(row.goldpetal)}</td>
            <td>${row.spread >= 0 ? '+' : ''}${row.spread.toFixed(1)}</td>
            <td>${fmtInt(row.goldm_vol)}</td>
        `;
        tbody.appendChild(tr);
    });
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  MASTER UPDATE                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

/** Collect UI control values and fetch new analysis from server. */
function updateDashboard() {
    const contractA = contractAEl.value;
    const contractB = contractBEl.value;
    const threshold = parseFloat(thresholdEl.value);
    const minVolume = parseFloat(volumeEl.value);
    const rollingWindow = rollingEl.checked ? 10 : 0;

    if (contractA === contractB) {
        showUploadError('Contract A and Contract B must be different.');
        return;
    }
    clearUploadError();

    if (uploadedRows) {
        // Use uploaded data: POST to /api/upload is only for initial file parse.
        // Re-request analysis with same rows via query params (not re-uploading file).
        // Instead, we re-fetch /api/data from sample, but since user uploaded,
        // we call /api/upload with a re-computed flag or use a temporary approach:
        // We store the uploaded data and compute via /api/sample-like endpoint.
        // Simplest: call /api/data with query params; the server always reads sample_gold_data.csv.
        // For uploaded data we cached rows; call compute locally.
        fetchAndRender(`/api/data?contract_a=${contractA}&contract_b=${contractB}&threshold=${threshold}&min_volume=${minVolume}&rolling_window=${rollingWindow}`);
    } else {
        fetchAndRender(`/api/data?contract_a=${contractA}&contract_b=${contractB}&threshold=${threshold}&min_volume=${minVolume}&rolling_window=${rollingWindow}`);
    }
}

function fetchAndRender(url) {
    fetch(url)
        .then(r => r.json())
        .then(json => {
            if (json.error) { showUploadError(json.error); return; }
            currentData = json.data;
            currentAnalysis = json.analysis;
            renderAll();
        })
        .catch(err => showUploadError('Network error: ' + err.message));
}

function renderAll() {
    renderPriceChart(currentData);
    renderSpreadChart(currentData, currentAnalysis);
    renderStats(currentAnalysis);
    renderChecks(currentAnalysis);
    renderTable(currentData, currentAnalysis);
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CONTROLS EVENT WIRING                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

// Slider display updates (instant, no fetch)
thresholdEl.addEventListener('input', () => {
    thresholdValEl.textContent = parseFloat(thresholdEl.value).toFixed(1);
});
volumeEl.addEventListener('input', () => {
    volumeValEl.textContent = Number(volumeEl.value).toLocaleString('en-IN');
});

// Fetch on change of any control
contractAEl.addEventListener('change', updateDashboard);
contractBEl.addEventListener('change', updateDashboard);
thresholdEl.addEventListener('change', updateDashboard);
volumeEl.addEventListener('change', updateDashboard);
rollingEl.addEventListener('change', updateDashboard);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CSV UPLOAD                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

csvInputEl.addEventListener('change', () => {
    const file = csvInputEl.files[0];
    if (!file) return;

    clearUploadError();

    const contractA = contractAEl.value;
    const contractB = contractBEl.value;
    const threshold = parseFloat(thresholdEl.value);
    const minVolume = parseFloat(volumeEl.value);
    const rollingWindow = rollingEl.checked ? 10 : 0;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('contract_a', contractA);
    formData.append('contract_b', contractB);
    formData.append('threshold', threshold);
    formData.append('min_volume', minVolume);
    formData.append('rolling_window', rollingWindow);

    fetch('/api/upload', { method: 'POST', body: formData })
        .then(r => r.json())
        .then(json => {
            if (json.error) { showUploadError(json.error); return; }
            uploadedRows = true;   // mark as using uploaded data
            currentData = json.data;
            currentAnalysis = json.analysis;
            renderAll();
        })
        .catch(err => showUploadError('Upload failed: ' + err.message));

    // Reset input so the same file can be reuploaded
    csvInputEl.value = '';
});

/* ─────────────────────────────────────────────────────────────────────────── */
/*  RESET TO SAMPLE DATA                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

btnResetEl.addEventListener('click', () => {
    uploadedRows = null;
    clearUploadError();
    updateDashboard();
});

/* ─────────────────────────────────────────────────────────────────────────── */
/*  UTILITY HELPERS                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function fmt(n) {
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n) {
    return Math.round(n).toLocaleString('en-IN');
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showUploadError(msg) {
    uploadErrEl.textContent = '⚠ ' + msg;
    uploadErrEl.style.display = 'block';
}

function clearUploadError() {
    uploadErrEl.style.display = 'none';
    uploadErrEl.textContent = '';
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  INITIAL RENDER ON PAGE LOAD                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
    // Sync slider display labels to initial values
    thresholdValEl.textContent = parseFloat(thresholdEl.value).toFixed(1);
    volumeValEl.textContent = Number(volumeEl.value).toLocaleString('en-IN');

    // Initial render using data injected from Flask
    renderAll();
});
