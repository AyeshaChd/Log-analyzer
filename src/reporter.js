import fs from 'fs';
import path from 'path';

// ANSI escape codes for terminal coloring
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

/**
 * Renders a beautiful terminal dashboard.
 */
export function generateTerminalReport(summary, percentiles) {
  const {
    totalLines,
    parsedCount,
    anomalyCount,
    malformedCount,
    startTime,
    endTime,
    statusCodes,
    methods,
    paths,
    malformedSummary,
    anomalySummary,
    slowestRequests
  } = summary;

  const parseRate = totalLines ? ((parsedCount / totalLines) * 100).toFixed(2) : '0.00';
  const malformedRate = totalLines ? ((malformedCount / totalLines) * 100).toFixed(2) : '0.00';
  const anomalyRate = parsedCount ? ((anomalyCount / parsedCount) * 100).toFixed(2) : '0.00';

  console.log(`\n${COLORS.bold}${COLORS.cyan}┌────────────────────────────────────────────────────────┐${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}│                LOG ANALYZER DASHBOARD                  │${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}└────────────────────────────────────────────────────────┘${COLORS.reset}`);

  // 1. OVERVIEW
  console.log(`\n${COLORS.bold}${COLORS.blue}📂 OVERVIEW${COLORS.reset}`);
  console.log(`  • Time Span:        ${COLORS.bold}${startTime ? new Date(startTime).toUTCString() : 'N/A'}${COLORS.reset} to ${COLORS.bold}${endTime ? new Date(endTime).toUTCString() : 'N/A'}${COLORS.reset}`);
  console.log(`  • Total Lines:      ${COLORS.bold}${totalLines.toLocaleString()}${COLORS.reset}`);

  const parsedColor = malformedCount === 0 ? COLORS.green : COLORS.yellow;
  console.log(`  • Parsed OK:        ${parsedColor}${parsedCount.toLocaleString()} (${parseRate}%)${COLORS.reset}`);

  const malformedColor = malformedCount > 0 ? COLORS.red : COLORS.dim;
  console.log(`  • Malformed:        ${malformedColor}${malformedCount.toLocaleString()} (${malformedRate}%)${COLORS.reset}`);

  const anomalyColor = anomalyCount > 0 ? COLORS.yellow : COLORS.dim;
  console.log(`  • Anomalous parsed: ${anomalyColor}${anomalyCount.toLocaleString()} (${anomalyRate}% of parsed)${COLORS.reset}`);

  // 2. LATENCY METRICS
  console.log(`\n${COLORS.bold}${COLORS.blue}⚡ LATENCY METRICS${COLORS.reset}`);
  console.log(`  • p50 (Median):     ${COLORS.bold}${percentiles.p50.toFixed(1)} ms${COLORS.reset}`);
  console.log(`  • p95 (Slowest 5%): ${COLORS.yellow}${COLORS.bold}${percentiles.p95.toFixed(1)} ms${COLORS.reset}`);
  console.log(`  • p99 (Slowest 1%): ${COLORS.red}${COLORS.bold}${percentiles.p99.toFixed(1)} ms${COLORS.reset}`);

  // 3. HTTP STATUS CODES
  console.log(`\n${COLORS.bold}${COLORS.blue}🚦 HTTP STATUS CODES${COLORS.reset}`);
  const categories = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, 'other': 0 };
  let missingStatus = 0;

  for (const [codeStr, count] of Object.entries(statusCodes)) {
    if (codeStr === 'null') {
      missingStatus += count;
      continue;
    }
    const code = parseInt(codeStr, 10);
    if (code >= 200 && code < 300) categories['2xx'] += count;
    else if (code >= 300 && code < 400) categories['3xx'] += count;
    else if (code >= 400 && code < 500) categories['4xx'] += count;
    else if (code >= 500 && code < 600) categories['5xx'] += count;
    else categories['other'] += count;
  }

  const printStatusCount = (label, count, color) => {
    const pct = parsedCount ? ((count / parsedCount) * 100).toFixed(1) : '0.0';
    console.log(`  • ${label}: ${color}${count.toLocaleString().padStart(8)} (${pct}%)${COLORS.reset}`);
  };

  printStatusCount('2xx (Success)', categories['2xx'], COLORS.green);
  printStatusCount('3xx (Redir)  ', categories['3xx'], COLORS.cyan);
  printStatusCount('4xx (Client) ', categories['4xx'], COLORS.yellow);
  printStatusCount('5xx (Server) ', categories['5xx'], COLORS.red);
  if (categories['other'] > 0) printStatusCount('Other        ', categories['other'], COLORS.magenta);
  if (missingStatus > 0) printStatusCount('Missing (-)  ', missingStatus, COLORS.dim);

  // 4. TOP SLOWEST ENDPOINTS
  console.log(`\n${COLORS.bold}${COLORS.blue}🐢 TOP 5 SLOWEST REQUESTS${COLORS.reset}`);
  if (slowestRequests.length === 0) {
    console.log('  No requests recorded.');
  } else {
    console.log(`  ┌───────┬──────────────────────────┬──────┬─────────┬─────────────┐`);
    console.log(`  │ ${COLORS.bold}Method${COLORS.reset} │ ${COLORS.bold}Endpoint${COLORS.reset.padEnd(32)} │ ${COLORS.bold}Code${COLORS.reset} │ ${COLORS.bold}Duration${COLORS.reset}│ ${COLORS.bold}Time (UTC)${COLORS.reset}  │`);
    console.log(`  ├───────┼──────────────────────────┼──────┼─────────┼─────────────┤`);

    slowestRequests.slice(0, 5).forEach(req => {
      const method = req.method.padEnd(5);
      const pathText = (req.path.length > 24 ? req.path.substring(0, 21) + '...' : req.path).padEnd(24);
      const statusText = (req.status !== null ? req.status.toString() : '-').padStart(4);
      const durText = `${req.duration}ms`.padStart(7);
      const timeText = req.timestamp.substring(11, 19); // HH:MM:SS
      console.log(`  │ ${COLORS.green}${method}${COLORS.reset} │ ${pathText} │ ${statusText} │ ${COLORS.yellow}${durText}${COLORS.reset} │ ${timeText}    │`);
    });
    console.log(`  └───────┴──────────────────────────┴──────┴─────────┴─────────────┘`);
  }

  // 5. ANOMALIES & PARSER ISSUES
  if (malformedCount > 0 || anomalyCount > 0) {
    console.log(`\n${COLORS.bold}${COLORS.blue}⚠️ FORMAT ANOMALIES & PARSER ISSUES${COLORS.reset}`);

    if (malformedCount > 0) {
      console.log(`  ${COLORS.bold}${COLORS.red}Malformed / Skipped lines:${COLORS.reset}`);
      for (const [reason, count] of Object.entries(malformedSummary)) {
        console.log(`    • ${reason.padEnd(25)}: ${COLORS.red}${count.toLocaleString()}${COLORS.reset}`);
      }
    }

    if (anomalyCount > 0) {
      console.log(`  ${COLORS.bold}${COLORS.yellow}Anomalies parsed successfully:${COLORS.reset}`);
      for (const [anomaly, count] of Object.entries(anomalySummary)) {
        console.log(`    • ${anomaly.padEnd(25)}: ${COLORS.yellow}${count.toLocaleString()}${COLORS.reset}`);
      }
    }
  }

  console.log(`\n${COLORS.bold}${COLORS.cyan}└────────────────────────────────────────────────────────┘${COLORS.reset}\n`);
}

/**
 * Generates an interactive, premium HTML dashboard report.
 */
export function generateHtmlReport(summary, percentiles, outputPath) {
  const {
    totalLines,
    parsedCount,
    anomalyCount,
    malformedCount,
    startTime,
    endTime,
    statusCodes,
    methods,
    paths,
    ips,
    malformedSummary,
    anomalySummary,
    slowestRequests,
    timeBuckets,
    malformedSamples,
    anomalySamples,
    standardSamples,
    jsonSamples
  } = summary;

  // Process timeline data for Chart.js
  const sortedBucketKeys = Object.keys(timeBuckets).sort();
  const timelineLabels = sortedBucketKeys.map(k => k);
  const timelineTraffic = sortedBucketKeys.map(k => timeBuckets[k].total);
  const timelineErrors = sortedBucketKeys.map(k => timeBuckets[k].error);

  // Process methods for chart
  const methodKeys = Object.keys(methods);
  const methodCounts = Object.values(methods);

  // Process status codes for chart
  const statusKeys = Object.keys(statusCodes).map(k => k === 'null' ? 'Missing (-)' : k);
  const statusCounts = Object.values(statusCodes);

  // Sort paths to find top 10 visited
  const sortedPaths = Object.entries(paths)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([p, data]) => ({
      path: p,
      count: data.count,
      avg: Math.round(data.totalDuration / data.count),
      max: data.maxDuration
    }));

  // Sort IPs to find top 10 active
  const sortedIps = Object.entries(ips)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([ip, data]) => ({
      ip,
      count: data.count,
      errors: data.errorCount,
      errorRate: data.count ? ((data.errorCount / data.count) * 100).toFixed(1) : '0.0'
    }));

  // Prepare a unified sample log of up to 1000 items
  const allSamples = [
    ...standardSamples.map(s => ({ ...s, type: 'standard' })),
    ...jsonSamples.map(s => ({ ...s, type: 'json' })),
    ...anomalySamples.map(s => ({ ...s, type: 'anomaly' })),
    ...malformedSamples.map(s => ({ ...s, type: 'malformed' }))
  ].sort((a, b) => {
    const timeA = a.data ? new Date(a.data.timestamp).getTime() : 0;
    const timeB = b.data ? new Date(b.data.timestamp).getTime() : 0;
    return timeA - timeB;
  }).slice(0, 1000);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Log Analyzer Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-primary: #0b0f19;
      --bg-secondary: #161f30;
      --bg-tertiary: #1e2b43;
      --text-primary: #f3f4f6;
      --text-secondary: #9ca3af;
      --text-muted: #6b7280;
      --accent: #3b82f6;
      --accent-hover: #60a5fa;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --border-color: #2e3d56;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3);
      --font-sans: 'Plus Jakarta Sans', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    [data-theme="light"] {
      --bg-primary: #f8fafc;
      --bg-secondary: #ffffff;
      --bg-tertiary: #f1f5f9;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --success: #16a34a;
      --warning: #d97706;
      --danger: #dc2626;
      --border-color: #e2e8f0;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      transition: background-color 0.2s, border-color 0.2s;
    }

    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-primary);
      padding: 24px;
      line-height: 1.5;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .header-left h1 {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header-left h1 span {
      background: linear-gradient(135deg, var(--accent), var(--accent-hover));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .header-left p {
      color: var(--text-secondary);
      font-size: 14px;
      margin-top: 4px;
    }

    .theme-toggle {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: var(--shadow);
    }

    .theme-toggle:hover {
      background: var(--bg-tertiary);
    }

    /* Cards Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }

    .card {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
    }

    .card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .card-value {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .card-subtext {
      font-size: 12px;
      color: var(--text-muted);
    }

    .card.border-danger { border-left: 4px solid var(--danger); }
    .card.border-warning { border-left: 4px solid var(--warning); }
    .card.border-success { border-left: 4px solid var(--success); }
    .card.border-accent { border-left: 4px solid var(--accent); }

    /* Dashboard Layout */
    .dashboard-layout {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }

    @media (max-width: 1024px) {
      .dashboard-layout {
        grid-template-columns: 1fr;
      }
    }

    .section-card {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 24px;
      box-shadow: var(--shadow);
      margin-bottom: 24px;
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
    }

    .chart-container {
      position: relative;
      height: 300px;
      width: 100%;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      text-align: left;
    }

    th {
      font-weight: 600;
      color: var(--text-secondary);
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-color);
      background-color: var(--bg-tertiary);
    }

    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-color);
      color: var(--text-primary);
      vertical-align: middle;
    }

    tr:hover td {
      background-color: var(--bg-tertiary);
    }

    .badge {
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .badge-success { background-color: rgba(16, 185, 129, 0.15); color: var(--success); }
    .badge-warning { background-color: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .badge-danger { background-color: rgba(239, 68, 68, 0.15); color: var(--danger); }
    .badge-info { background-color: rgba(59, 130, 246, 0.15); color: var(--accent); }

    /* Interactive Log Explorer */
    .explorer-toolbar {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .search-input {
      flex-grow: 1;
      min-width: 200px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 8px 12px;
      border-radius: 6px;
      font-family: var(--font-sans);
      font-size: 14px;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .filter-select {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 8px 12px;
      border-radius: 6px;
      font-family: var(--font-sans);
      font-size: 14px;
      cursor: pointer;
    }

    .tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 16px;
      overflow-x: auto;
    }

    .tab-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
    }

    .tab-btn:hover {
      color: var(--text-primary);
    }

    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      font-weight: 600;
    }

    .mono {
      font-family: var(--font-mono);
      font-size: 12px;
    }

    .log-list {
      max-height: 500px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: 8px;
    }

    .log-item {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-color);
      font-family: var(--font-mono);
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .log-item:last-child {
      border-bottom: none;
    }

    .log-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--text-muted);
    }

    .log-item-body {
      word-break: break-all;
      white-space: pre-wrap;
    }

    .log-anomaly-tag {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: var(--warning);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 10px;
      margin-right: 4px;
    }

    .log-error-tag {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: var(--danger);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 10px;
    }

    .micro-animation {
      transition: transform 0.2s ease;
    }

    .micro-animation:hover {
      transform: translateY(-2px);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-left">
        <h1><span>Log Analyzer Report</span></h1>
        <p>Generated on ${new Date().toUTCString()} | Analyzer Version 1.0.0</p>
      </div>
      <button class="theme-toggle" id="theme-btn">
        <span id="theme-icon">🌙</span> <span id="theme-text">Dark Mode</span>
      </button>
    </header>

    <!-- Metrics Summary Card Grid -->
    <div class="metrics-grid">
      <div class="card border-accent micro-animation">
        <div class="card-title">Total Processed</div>
        <div class="card-value">${totalLines.toLocaleString()}</div>
        <div class="card-subtext">Total lines read from file</div>
      </div>
      <div class="card border-success micro-animation">
        <div class="card-title">Parser Success</div>
        <div class="card-value">${((parsedCount / (totalLines || 1)) * 100).toFixed(1)}%</div>
        <div class="card-subtext">${parsedCount.toLocaleString()} lines matched</div>
      </div>
      <div class="card border-danger micro-animation">
        <div class="card-title">Malformed / Skipped</div>
        <div class="card-value">${((malformedCount / (totalLines || 1)) * 100).toFixed(1)}%</div>
        <div class="card-subtext">${malformedCount.toLocaleString()} lines skipped</div>
      </div>
      <div class="card border-warning micro-animation">
        <div class="card-title">Anomalous Entries</div>
        <div class="card-value">${((anomalyCount / (parsedCount || 1)) * 100).toFixed(1)}%</div>
        <div class="card-subtext">${anomalyCount.toLocaleString()} parse exceptions</div>
      </div>
      <div class="card border-accent micro-animation">
        <div class="card-title">Latency (p95)</div>
        <div class="card-value">${percentiles.p95.toFixed(0)} ms</div>
        <div class="card-subtext">p99: ${percentiles.p99.toFixed(0)} ms | Median: ${percentiles.p50.toFixed(0)} ms</div>
      </div>
    </div>

    <!-- Charts & Tables Layout -->
    <div class="dashboard-layout">
      <!-- Left side: Timeline Chart & Anomalies -->
      <div>
        <div class="section-card">
          <div class="section-title">Traffic & Error Trend Over Time</div>
          <div class="chart-container">
            <canvas id="timelineChart"></canvas>
          </div>
        </div>

        <div class="section-card">
          <div class="section-title">Top 10 Slowest Endpoints</div>
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Avg Duration</th>
                <th>Max Duration</th>
                <th>Call Count</th>
              </tr>
            </thead>
            <tbody>
              ${sortedPaths.map(p => `
                <tr>
                  <td><span class="badge ${p.avg > 800 ? 'badge-danger' : p.avg > 300 ? 'badge-warning' : 'badge-success'}">${p.path.startsWith('/api') ? 'API' : 'STATIC'}</span></td>
                  <td class="mono">${p.path}</td>
                  <td><strong>${p.avg} ms</strong></td>
                  <td>${p.max} ms</td>
                  <td>${p.count.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right side: Distributions & Anomalies List -->
      <div>
        <div class="section-card">
          <div class="section-title">Response Code Distribution</div>
          <div class="chart-container" style="height: 220px;">
            <canvas id="statusCodeChart"></canvas>
          </div>
        </div>

        <div class="section-card">
          <div class="section-title">Top Active Client IPs</div>
          <table>
            <thead>
              <tr>
                <th>IP Address</th>
                <th>Requests</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              ${sortedIps.map(item => `
                <tr>
                  <td class="mono" style="font-size: 11px;">${item.ip}</td>
                  <td>${item.count.toLocaleString()}</td>
                  <td><span class="${item.errors > 0 ? 'badge badge-danger' : 'badge badge-success'}">${item.errorRate}%</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="section-card">
          <div class="section-title">Anomalies & Parser Health</div>
          <div style="font-size: 13px;">
            ${malformedCount > 0 ? `
              <div style="margin-bottom: 12px;">
                <div style="font-weight: 600; color: var(--danger); margin-bottom: 4px;">Malformed Lines (${malformedCount})</div>
                ${Object.entries(malformedSummary).map(([reason, count]) => `
                  <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span style="color: var(--text-secondary);">${reason}</span>
                    <span class="mono">${count}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
            ${anomalyCount > 0 ? `
              <div>
                <div style="font-weight: 600; color: var(--warning); margin-bottom: 4px;">Format Anomalies (${anomalyCount})</div>
                ${Object.entries(anomalySummary).map(([anomaly, count]) => `
                  <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span style="color: var(--text-secondary);">${anomaly}</span>
                    <span class="mono">${count}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Interactive Log Explorer -->
    <div class="section-card">
      <div class="section-title">Interactive Log Explorer (Sample size: ${allSamples.length})</div>
      
      <div class="explorer-toolbar">
        <input type="text" class="search-input" id="log-search" placeholder="Search by IP, Path, Method, status code, or message...">
        <select class="filter-select" id="log-type-filter">
          <option value="all">All Logs</option>
          <option value="standard">Standard Format</option>
          <option value="json">JSON Format</option>
          <option value="anomaly">Anomalies</option>
          <option value="malformed">Malformed / Skipped</option>
        </select>
        <select class="filter-select" id="log-status-filter">
          <option value="all">All Statuses</option>
          <option value="2xx">2xx Success</option>
          <option value="3xx">3xx Redirection</option>
          <option value="4xx">4xx Client Error</option>
          <option value="5xx">5xx Server Error</option>
          <option value="missing">Missing / -</option>
        </select>
      </div>

      <div class="log-list" id="log-container">
        <!-- Rendered by JavaScript -->
      </div>
    </div>
  </div>

  <script>
    // Theme Toggle Logic
    const themeBtn = document.getElementById('theme-btn');
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    
    // Default to dark theme
    let currentTheme = 'dark';
    
    themeBtn.addEventListener('click', () => {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', currentTheme);
      themeIcon.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
      themeText.textContent = currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
      
      // Update charts for theme contrast
      updateChartsTheme();
    });

    // Charting Configuration
    const timelineCtx = document.getElementById('timelineChart').getContext('2d');
    const statusCodeCtx = document.getElementById('statusCodeChart').getContext('2d');

    const chartColors = {
      dark: {
        grid: '#2e3d56',
        text: '#9ca3af'
      },
      light: {
        grid: '#e2e8f0',
        text: '#475569'
      }
    };

    let timelineChart = new Chart(timelineCtx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(timelineLabels)},
        datasets: [
          {
            label: 'Requests',
            data: ${JSON.stringify(timelineTraffic)},
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.3,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Errors (5xx / Malformed)',
            data: ${JSON.stringify(timelineErrors)},
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.3,
            fill: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: chartColors.dark.grid },
            ticks: { color: chartColors.dark.text, font: { family: 'Plus Jakarta Sans' } }
          },
          y: {
            position: 'left',
            grid: { color: chartColors.dark.grid },
            ticks: { color: chartColors.dark.text, font: { family: 'Plus Jakarta Sans' } },
            title: { display: true, text: 'RequestsCount', color: '#3b82f6' }
          },
          y1: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: chartColors.dark.text, font: { family: 'Plus Jakarta Sans' } },
            title: { display: true, text: 'ErrorsCount', color: '#ef4444' }
          }
        },
        plugins: {
          legend: {
            labels: { color: chartColors.dark.text, font: { family: 'Plus Jakarta Sans' } }
          }
        }
      }
    });

    let statusCodeChart = new Chart(statusCodeCtx, {
      type: 'doughnut',
      data: {
        labels: ${JSON.stringify(statusKeys)},
        datasets: [{
          data: ${JSON.stringify(statusCounts)},
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: chartColors.dark.text, font: { family: 'Plus Jakarta Sans' } }
          }
        }
      }
    });

    function updateChartsTheme() {
      const activeTheme = currentTheme;
      const themeColors = chartColors[activeTheme];

      // Update timeline scales
      timelineChart.options.scales.x.grid.color = themeColors.grid;
      timelineChart.options.scales.x.ticks.color = themeColors.text;
      timelineChart.options.scales.y.grid.color = themeColors.grid;
      timelineChart.options.scales.y.ticks.color = themeColors.text;
      timelineChart.options.scales.y1.ticks.color = themeColors.text;
      timelineChart.options.plugins.legend.labels.color = themeColors.text;
      timelineChart.update();

      // Update doughnut
      statusCodeChart.options.plugins.legend.labels.color = themeColors.text;
      statusCodeChart.update();
    }

    // Log Explorer Logic
    const logData = ${JSON.stringify(allSamples)};
    const searchInput = document.getElementById('log-search');
    const typeFilter = document.getElementById('log-type-filter');
    const statusFilter = document.getElementById('log-status-filter');
    const logContainer = document.getElementById('log-container');

    function renderLogs() {
      const search = searchInput.value.toLowerCase();
      const type = typeFilter.value;
      const statusGroup = statusFilter.value;

      const filtered = logData.filter(log => {
        // Search Match
        const matchSearch = log.line.toLowerCase().includes(search) || 
                            (log.malformedReason && log.malformedReason.toLowerCase().includes(search)) ||
                            (log.data && (
                              (log.data.ip && log.data.ip.toLowerCase().includes(search)) ||
                              (log.data.path && log.data.path.toLowerCase().includes(search)) ||
                              (log.data.method && log.data.method.toLowerCase().includes(search))
                            ));
        
        if (!matchSearch) return false;

        // Type Match
        if (type !== 'all') {
          if (type === 'anomaly' && log.type !== 'anomaly') return false;
          if (type === 'malformed' && log.type !== 'malformed') return false;
          if (type === 'json' && log.type !== 'json') return false;
          if (type === 'standard' && log.type !== 'standard') return false;
        }

        // Status Match
        if (statusGroup !== 'all') {
          if (!log.data) return false;
          const status = log.data.status;
          if (statusGroup === 'missing' && status !== null) return false;
          if (statusGroup === '2xx' && (status === null || status < 200 || status >= 300)) return false;
          if (statusGroup === '3xx' && (status === null || status < 300 || status >= 400)) return false;
          if (statusGroup === '4xx' && (status === null || status < 400 || status >= 500)) return false;
          if (statusGroup === '5xx' && (status === null || status < 500 || status >= 600)) return false;
        }

        return true;
      });

      if (filtered.length === 0) {
        logContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">No matching log entries found.</div>';
        return;
      }

      logContainer.innerHTML = filtered.map(log => {
        let typeBadge = '';
        let statusBadge = '';
        let tags = '';

        if (log.type === 'malformed') {
          typeBadge = '<span class="badge badge-danger">MALFORMED</span>';
          tags = '<span class="log-error-tag">Reason: ' + log.malformedReason + '</span>';
        } else {
          const typeLabel = log.type === 'json' ? 'JSON' : log.type === 'anomaly' ? 'ANOMALY' : 'STANDARD';
          const typeClass = log.type === 'json' ? 'badge-info' : log.type === 'anomaly' ? 'badge-warning' : 'badge-success';
          typeBadge = '<span class="badge ' + typeClass + '">' + typeLabel + '</span>';
          
          if (log.anomalies && log.anomalies.length > 0) {
            tags = log.anomalies.map(a => '<span class="log-anomaly-tag">' + a + '</span>').join('');
          }

          const status = log.data.status;
          if (status === null) {
            statusBadge = '<span class="badge badge-warning" style="background-color:rgba(245,158,11,0.1);">STATUS: -</span>';
          } else {
            const statusClass = status >= 500 ? 'badge-danger' : status >= 400 ? 'badge-warning' : 'badge-success';
            statusBadge = '<span class="badge ' + statusClass + '">STATUS: ' + status + '</span>';
          }
        }

        const dateStr = log.data ? new Date(log.data.timestamp).toISOString() : 'N/A';
        const methodStr = log.data ? log.data.method + ' ' : '';
        const ipStr = log.data && log.data.ip ? log.data.ip + ' | ' : '';
        const durationStr = log.data && log.data.duration ? ' | ' + log.data.duration + 'ms' : '';

        return '<div class="log-item">' +
                 '<div class="log-item-header">' +
                   '<div>' + typeBadge + ' ' + statusBadge + '</div>' +
                   '<div>' + ipStr + methodStr + dateStr + durationStr + '</div>' +
                 '</div>' +
                 '<div class="log-item-body">' + escapeHtml(log.line) + '</div>' +
                 (tags ? '<div style="margin-top: 4px;">' + tags + '</div>' : '') +
               '</div>';
      }).join('');
    }

    function escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    searchInput.addEventListener('input', renderLogs);
    typeFilter.addEventListener('change', renderLogs);
    statusFilter.addEventListener('change', renderLogs);

    // Initial render
    renderLogs();
  </script>
</body>
</html>`;

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, htmlContent, 'utf8');
}
