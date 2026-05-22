import { parseLine, normalizeTimestamp, normalizeDuration } from '../src/parser.js';

const PASS = '\x1b[32m✔ PASS\x1b[0m';
const FAIL = '\x1b[31m✘ FAIL\x1b[0m';

let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ${PASS} ${message}`);
  } else {
    console.log(`  ${FAIL} ${message}`);
    failedTests++;
  }
}

function testTimestamps() {
  console.log('\n--- Testing Timestamp Normalization ---');

  // ISO
  try {
    const { isoString } = normalizeTimestamp('2024-03-15T14:23:01Z');
    assert(isoString === '2024-03-15T14:23:01.000Z', 'Parses standard ISO 8601');
  } catch (e) {
    assert(false, `ISO 8601 failed: ${e.message}`);
  }

  // Slash
  try {
    const { isoString, anomalies } = normalizeTimestamp('2024/03/15 14:23:01');
    assert(isoString === '2024-03-15T14:23:01.000Z', 'Parses Slash format YYYY/MM/DD');
    assert(anomalies.includes('slash_timestamp_format'), 'Flags slash format anomaly');
  } catch (e) {
    assert(false, `Slash format failed: ${e.message}`);
  }

  // Dash Month
  try {
    const { isoString, anomalies } = normalizeTimestamp('15-Mar-2024 14:23:01');
    assert(isoString === '2024-03-15T14:23:01.000Z', 'Parses Dash-Month format DD-MMM-YYYY');
    assert(anomalies.includes('dash_month_timestamp_format'), 'Flags dash-month anomaly');
  } catch (e) {
    assert(false, `Dash Month failed: ${e.message}`);
  }

  // Unix Epoch (seconds)
  try {
    const { isoString, anomalies } = normalizeTimestamp('1710512581');
    assert(isoString === '2024-03-15T14:23:01.000Z', 'Parses Unix epoch (seconds)');
    assert(anomalies.includes('unix_epoch_timestamp'), 'Flags unix epoch anomaly');
  } catch (e) {
    assert(false, `Unix Epoch (seconds) failed: ${e.message}`);
  }

  // Unix Epoch (milliseconds)
  try {
    const { isoString, anomalies } = normalizeTimestamp('1710512581000');
    assert(isoString === '2024-03-15T14:23:01.000Z', 'Parses Unix epoch (milliseconds)');
    assert(anomalies.includes('unix_epoch_timestamp'), 'Flags unix epoch anomaly');
  } catch (e) {
    assert(false, `Unix Epoch (milliseconds) failed: ${e.message}`);
  }
}

function testDurations() {
  console.log('\n--- Testing Duration Normalization ---');

  // ms
  const d1 = normalizeDuration('142ms');
  assert(d1.ms === 142 && d1.anomaly === null, 'Parses ms duration');

  // s
  const d2 = normalizeDuration('0.142s');
  assert(d2.ms === 142 && d2.anomaly === 'seconds_duration_unit', 'Parses seconds duration and flags anomaly');

  // raw
  const d3 = normalizeDuration('142');
  assert(d3.ms === 142 && d3.anomaly === 'raw_number_duration_unit', 'Parses raw ms duration and flags anomaly');
}

function testParseStandardLine() {
  console.log('\n--- Testing Standard Line Parsing ---');

  const line = '2024-03-15T14:23:01Z 192.168.1.42 GET /api/users 200 142ms';
  const res = parseLine(line);
  
  assert(res.success === true, 'Successfully parses standard line');
  assert(res.data.timestamp === '2024-03-15T14:23:01.000Z', 'Standard timestamp parsed correctly');
  assert(res.data.ip === '192.168.1.42', 'Standard IP parsed correctly');
  assert(res.data.method === 'GET', 'Standard method parsed correctly');
  assert(res.data.path === '/api/users', 'Standard path parsed correctly');
  assert(res.data.status === 200, 'Standard status parsed correctly');
  assert(res.data.duration === 142, 'Standard duration parsed correctly');
  assert(res.anomalies.length === 0, 'No anomalies detected for standard line');
}

function testParseLineAnomalies() {
  console.log('\n--- Testing Line Anomalies ---');

  // Missing status code (-)
  const line1 = '2024-03-15T14:23:01Z 192.168.1.42 GET /api/users - 142ms';
  const res1 = parseLine(line1);
  assert(res1.success === true, 'Parses line with missing status code');
  assert(res1.data.status === null, 'Status is parsed as null');
  assert(res1.anomalies.includes('missing_status_code'), 'Flags missing status code anomaly');

  // Extra fields (User Agent, referrers)
  const line2 = '2024-03-15T14:23:01Z 192.168.1.42 GET /api/users 200 142ms "Mozilla/5.0" "https://referrer.com"';
  const res2 = parseLine(line2);
  assert(res2.success === true, 'Parses line with extra fields');
  assert(res2.data.extra === '"Mozilla/5.0" "https://referrer.com"', 'Captures extra fields correctly');
  assert(res2.anomalies.includes('extra_fields'), 'Flags extra fields anomaly');

  // Mixed format: Dash-Month timestamp, seconds duration, missing status
  const line3 = '  15-Mar-2024 14:23:01 192.168.1.42 GET /api/users - 0.142s';
  const res3 = parseLine(line3);
  assert(res3.success === true, 'Parses complex multi-anomaly line');
  assert(res3.data.timestamp === '2024-03-15T14:23:01.000Z', 'Resolves dash-month timestamp');
  assert(res3.data.status === null, 'Resolves missing status');
  assert(res3.data.duration === 142, 'Resolves duration to ms');
  assert(res3.anomalies.includes('dash_month_timestamp_format'), 'Flags dash month anomaly');
  assert(res3.anomalies.includes('missing_status_code'), 'Flags missing status anomaly');
  assert(res3.anomalies.includes('seconds_duration_unit'), 'Flags seconds duration anomaly');
}

function testParseJsonLines() {
  console.log('\n--- Testing JSON Line Parsing ---');

  const line1 = '{"timestamp":"2024-03-15T14:23:01Z","ip":"192.168.1.42","method":"GET","path":"/api/users","status":200,"duration":"142ms"}';
  const res1 = parseLine(line1);

  assert(res1.success === true, 'Successfully parses JSON log line');
  assert(res1.data.timestamp === '2024-03-15T14:23:01.000Z', 'JSON timestamp parsed correctly');
  assert(res1.data.ip === '192.168.1.42', 'JSON IP parsed correctly');
  assert(res1.data.method === 'GET', 'JSON method parsed');
  assert(res1.data.path === '/api/users', 'JSON path parsed');
  assert(res1.data.status === 200, 'JSON status parsed');
  assert(res1.data.duration === 142, 'JSON duration parsed');
  assert(res1.anomalies.includes('json_format'), 'Flags JSON format anomaly');

  // JSON with extra keys
  const line2 = '{"timestamp":"1710512581","ip":"10.0.0.7","method":"POST","path":"/login","status":401,"duration":89,"some_extra_metadata":"foo"}';
  const res2 = parseLine(line2);
  assert(res2.success === true, 'Parses JSON with extra fields and Unix epoch');
  assert(res2.data.duration === 89, 'Parses raw duration');
  assert(res2.anomalies.includes('json_format'), 'Flags json_format');
  assert(res2.anomalies.includes('unix_epoch_timestamp'), 'Flags unix_epoch_timestamp');
  assert(res2.anomalies.includes('extra_fields'), 'Flags extra_fields');
  assert(res2.data.extra === '{"some_extra_metadata":"foo"}', 'Captures JSON extra properties');
}

function testMalformedLines() {
  console.log('\n--- Testing Malformed Lines ---');

  // Blank line
  const res1 = parseLine('   ');
  assert(res1.success === false, 'Detects blank line as malformed');
  assert(res1.malformedReason === 'empty_line', 'Reports correct reason: empty_line');

  // Stack trace line
  const res2 = parseLine('    at handleRequest (c:\\app\\controller.js:24:12)');
  assert(res2.success === false, 'Detects stack trace line as malformed');
  assert(res2.malformedReason === 'stack_trace_line', 'Reports correct reason: stack_trace_line');

  // Truncated line
  const res3 = parseLine('2024-03-15T14:23:01Z 192.168.1.42 GET');
  assert(res3.success === false, 'Detects truncated line (missing path) as malformed');
  assert(res3.malformedReason === 'missing_path', 'Reports correct reason: missing_path');
}

function runAll() {
  testTimestamps();
  testDurations();
  testParseStandardLine();
  testParseLineAnomalies();
  testParseJsonLines();
  testMalformedLines();

  console.log(`\n========================================`);
  if (failedTests === 0) {
    console.log(`\x1b[32m\x1b[1mALL TESTS PASSED SUCCESSFULLY!\x1b[0m`);
    process.exit(0);
  } else {
    console.log(`\x1b[31m\x1b[1m${failedTests} TEST(S) FAILED.\x1b[0m`);
    process.exit(1);
  }
}

runAll();
