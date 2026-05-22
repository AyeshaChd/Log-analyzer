#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { parseLine } from '../src/parser.js';
import { generateTerminalReport, generateHtmlReport } from '../src/reporter.js';

function printUsage() {
  console.log(`
Usage:
  node bin/analyze.js <path-to-log-file> [options]

Options:
  -o, --output <file>    Path to write the interactive HTML report (default: report.html)
  -h, --help             Show this help message
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help') || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const logFilePath = args[0];
  if (logFilePath.startsWith('-')) {
    console.error(`Error: First argument must be the log file path.`);
    printUsage();
    process.exit(1);
  }

  // Parse options
  let htmlOutputPath = 'report.html';
  const outputIdx = args.findIndex(arg => arg === '-o' || arg === '--output');
  if (outputIdx !== -1 && outputIdx + 1 < args.length) {
    htmlOutputPath = args[outputIdx + 1];
  }

  if (!fs.existsSync(logFilePath)) {
    console.error(`Error: Log file not found at "${logFilePath}"`);
    process.exit(1);
  }

  const summary = {
    totalLines: 0,
    parsedCount: 0,
    anomalyCount: 0,
    malformedCount: 0,
    startTime: null,
    endTime: null,

    malformedSummary: {},
    anomalySummary: {},
    methods: {},
    statusCodes: {},
    paths: {},
    ips: {},

    slowestRequests: [],
    timeBuckets: {}, // bucketKey -> { total, error }

    // Samples for HTML dashboard (cap at 250 each)
    malformedSamples: [],
    anomalySamples: [],
    standardSamples: [],
    jsonSamples: []
  };

  const durations = [];
  let lastKnownTimestamp = null;
  let lastMalformedSample = null;

  console.log(`Analyzing logs in "${logFilePath}"...`);

  const fileStream = fs.createReadStream(logFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    summary.totalLines++;
    const result = parseLine(line);

    if (result.success) {
      const data = result.data;
      summary.parsedCount++;

      // Track timestamps
      const tsMs = new Date(data.timestamp).getTime();
      if (summary.startTime === null || tsMs < new Date(summary.startTime).getTime()) {
        summary.startTime = data.timestamp;
      }
      if (summary.endTime === null || tsMs > new Date(summary.endTime).getTime()) {
        summary.endTime = data.timestamp;
      }
      lastKnownTimestamp = data.timestamp;

      // Track method
      summary.methods[data.method] = (summary.methods[data.method] || 0) + 1;

      // Track IP
      const clientIp = data.ip || 'unknown';
      if (!summary.ips[clientIp]) {
        summary.ips[clientIp] = { count: 0, errorCount: 0 };
      }
      summary.ips[clientIp].count++;

      // Track path
      if (!summary.paths[data.path]) {
        summary.paths[data.path] = { count: 0, totalDuration: 0, maxDuration: 0, minDuration: Infinity };
      }
      const pathStats = summary.paths[data.path];
      pathStats.count++;
      pathStats.totalDuration += data.duration;
      pathStats.maxDuration = Math.max(pathStats.maxDuration, data.duration);
      pathStats.minDuration = Math.min(pathStats.minDuration, data.duration);

      // Track status codes
      const codeStr = data.status !== null ? data.status.toString() : 'null';
      summary.statusCodes[codeStr] = (summary.statusCodes[codeStr] || 0) + 1;
      
      if (data.status === null || data.status >= 500) {
        summary.ips[clientIp].errorCount++;
      }

      // Track latency percentiles
      durations.push(data.duration);

      // Track slowest requests
      summary.slowestRequests.push(data);
      summary.slowestRequests.sort((a, b) => b.duration - a.duration);
      if (summary.slowestRequests.length > 20) {
        summary.slowestRequests.pop();
      }

      // Time buckets (hourly)
      const hourBucket = data.timestamp.substring(0, 13) + ':00';
      if (!summary.timeBuckets[hourBucket]) {
        summary.timeBuckets[hourBucket] = { total: 0, error: 0 };
      }
      summary.timeBuckets[hourBucket].total++;
      if (data.status === null || data.status >= 500) {
        summary.timeBuckets[hourBucket].error++;
      }

      // Handle sample storage
      const hasAnomalies = result.anomalies.length > 0;
      if (hasAnomalies) {
        summary.anomalyCount++;
        result.anomalies.forEach(anomaly => {
          summary.anomalySummary[anomaly] = (summary.anomalySummary[anomaly] || 0) + 1;
        });

        if (summary.anomalySamples.length < 250) {
          summary.anomalySamples.push(result);
        }
      } else if (data.originalFormat === 'json') {
        if (summary.jsonSamples.length < 250) {
          summary.jsonSamples.push(result);
        }
      } else {
        if (summary.standardSamples.length < 250) {
          summary.standardSamples.push(result);
        }
      }

      // Reset last malformed sample (since this is a valid parsed log)
      lastMalformedSample = null;

    } else {
      // Malformed / Skipped line
      summary.malformedCount++;
      const reason = result.malformedReason;
      summary.malformedSummary[reason] = (summary.malformedSummary[reason] || 0) + 1;

      // Group consecutive stack trace lines under the last malformed entry
      const isStackTraceLine = reason === 'stack_trace_line';
      if (isStackTraceLine && lastMalformedSample) {
        lastMalformedSample.line += `\n${line}`;
        // Also update reason if the initial line wasn't marked as stack trace
        if (!lastMalformedSample.malformedReason.includes('stack_trace')) {
          lastMalformedSample.malformedReason = 'stack_trace';
        }
      } else {
        // Create new malformed sample
        const sample = {
          success: false,
          line,
          data: lastKnownTimestamp ? { timestamp: lastKnownTimestamp } : null,
          anomalies: [],
          malformedReason: reason
        };
        
        if (summary.malformedSamples.length < 250) {
          summary.malformedSamples.push(sample);
          lastMalformedSample = sample;
        } else {
          lastMalformedSample = null;
        }
      }

      // Increment error count in the current/last active time bucket
      if (lastKnownTimestamp) {
        const hourBucket = lastKnownTimestamp.substring(0, 13) + ':00';
        if (!summary.timeBuckets[hourBucket]) {
          summary.timeBuckets[hourBucket] = { total: 0, error: 0 };
        }
        summary.timeBuckets[hourBucket].total++;
        summary.timeBuckets[hourBucket].error++;
      }
    }
  }

  // Calculate percentiles
  const percentiles = { p50: 0, p95: 0, p99: 0 };
  if (durations.length > 0) {
    durations.sort((a, b) => a - b);
    const getPercentile = (p) => {
      const idx = Math.floor((p / 100) * durations.length);
      return durations[Math.min(idx, durations.length - 1)];
    };
    percentiles.p50 = getPercentile(50);
    percentiles.p95 = getPercentile(95);
    percentiles.p99 = getPercentile(99);
  }

  // Generate Reports
  generateTerminalReport(summary, percentiles);
  
  try {
    generateHtmlReport(summary, percentiles, htmlOutputPath);
    console.log(`Saved interactive HTML report to: ${path.resolve(htmlOutputPath)}`);
  } catch (err) {
    console.error(`Failed to generate HTML report: ${err.message}`);
  }
}

main().catch(err => {
  console.error(`Fatal error in CLI analyzer:`, err);
  process.exit(1);
});
