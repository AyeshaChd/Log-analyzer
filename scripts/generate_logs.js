import fs from 'fs';
import path from 'path';

const IPS = [
  '192.168.1.42', '10.0.0.7', '172.16.0.5', '8.8.8.8', 
  '127.0.0.1', '86.12.34.128', '200.100.50.25', '192.168.1.100',
  '2001:0db8:85a3:0000:0000:8a2e:0370:7334', 'fe80::1'
];

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];

const PATHS = [
  '/api/users', '/api/login', '/api/users/12', '/api/users/45/posts',
  '/api/products', '/api/products/99', '/api/checkout', '/api/auth/token',
  '/index.html', '/css/styles.css', '/js/app.js', '/images/logo.png',
  '/api/search?q=node', '/api/v2/metrics', '/healthz', '/favicon.ico'
];

const STATUS_CODES = [200, 200, 200, 200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 404, 500, 503];

const USER_AGENTS = [
  '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"',
  '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15"',
  '"Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"',
  '"curl/8.4.0"',
  '"PostmanRuntime/7.36.1"',
  '"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"'
];

const REFERRERS = [
  '"https://google.com"',
  '"https://github.com/trending"',
  '"https://news.ycombinator.com/"',
  '"http://localhost:3000/dashboard"',
  '"-"'
];

// Helper to choose random item from array
const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper to get random integer in range
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Generate simulated date offset by minutes/seconds
function getBaseDate(offsetSeconds) {
  return new Date(Date.now() - offsetSeconds * 1000);
}

// Generate varied timestamp format
function generateTimestamp(baseDate, formatType) {
  switch (formatType) {
    case 'iso': // 2024-03-15T14:23:01Z
      return baseDate.toISOString();
    case 'slash': // 2024/03/15 14:23:01
      const y = baseDate.getFullYear();
      const m = String(baseDate.getMonth() + 1).padStart(2, '0');
      const d = String(baseDate.getDate()).padStart(2, '0');
      const hh = String(baseDate.getHours()).padStart(2, '0');
      const mm = String(baseDate.getMinutes()).padStart(2, '0');
      const ss = String(baseDate.getSeconds()).padStart(2, '0');
      return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
    case 'dash_month': // 15-Mar-2024 14:23:01
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = String(baseDate.getDate()).padStart(2, '0');
      const monthName = months[baseDate.getMonth()];
      const year = baseDate.getFullYear();
      const hour = String(baseDate.getHours()).padStart(2, '0');
      const min = String(baseDate.getMinutes()).padStart(2, '0');
      const sec = String(baseDate.getSeconds()).padStart(2, '0');
      return `${day}-${monthName}-${year} ${hour}:${min}:${sec}`;
    case 'unix': // 1710512581
      return Math.floor(baseDate.getTime() / 1000).toString();
    default:
      return baseDate.toISOString();
  }
}

// Generate varied duration format
function generateDuration(ms, formatType) {
  switch (formatType) {
    case 'ms':
      return `${ms}ms`;
    case 'sec':
      return `${(ms / 1000).toFixed(3)}s`;
    case 'raw':
      return ms.toString();
    default:
      return `${ms}ms`;
  }
}

function generateLine(offsetSeconds) {
  const baseDate = getBaseDate(offsetSeconds);
  const roll = Math.random();

  // 90% chance of standard line structure, 10% chance of anomalies / malformations
  if (roll < 0.90) {
    // Standard line with ISO timestamp, ms duration, standard code
    const ts = generateTimestamp(baseDate, 'iso');
    const ip = randItem(IPS);
    const method = randItem(METHODS);
    const path = randItem(PATHS);
    const code = randItem(STATUS_CODES);
    const duration = generateDuration(randInt(5, 1200), 'ms');
    
    // Sometimes add user agent or referrer
    let line = `${ts} ${ip} ${method} ${path} ${code} ${duration}`;
    if (Math.random() < 0.3) {
      line += ` ${randItem(USER_AGENTS)} ${randItem(REFERRERS)}`;
    }
    return line;
  } else {
    // Anomalous/Malformed/Alternative Format (10%)
    const subRoll = Math.random();

    if (subRoll < 0.20) {
      // 1. Varied Timestamp Formats
      const formats = ['slash', 'dash_month', 'unix'];
      const fmt = randItem(formats);
      const ts = generateTimestamp(baseDate, fmt);
      const ip = randItem(IPS);
      const method = randItem(METHODS);
      const path = randItem(PATHS);
      const code = randItem(STATUS_CODES);
      const duration = generateDuration(randInt(5, 1200), 'ms');
      return `  ${ts} ${ip} ${method} ${path} ${code} ${duration}`; // extra padding sometimes

    } else if (subRoll < 0.40) {
      // 2. Varied Duration Units (s or raw number)
      const ts = generateTimestamp(baseDate, 'iso');
      const ip = randItem(IPS);
      const method = randItem(METHODS);
      const path = randItem(PATHS);
      const code = randItem(STATUS_CODES);
      const fmt = Math.random() < 0.5 ? 'sec' : 'raw';
      const duration = generateDuration(randInt(5, 2500), fmt);
      return `${ts} ${ip} ${method} ${path} ${code} ${duration}`;

    } else if (subRoll < 0.55) {
      // 3. Status codes missing or replaced with '-'
      const ts = generateTimestamp(baseDate, 'iso');
      const ip = randItem(IPS);
      const method = randItem(METHODS);
      const path = randItem(PATHS);
      const code = Math.random() < 0.7 ? '-' : ''; // completely missing or '-'
      const duration = generateDuration(randInt(5, 500), 'ms');
      return `${ts} ${ip} ${method} ${path} ${code} ${duration}`.trim().replace(/\s+/g, ' ');

    } else if (subRoll < 0.70) {
      // 4. JSON-formatted lines
      const code = randItem(STATUS_CODES);
      const ms = randInt(5, 1500);
      const jsonFmt = {
        timestamp: generateTimestamp(baseDate, Math.random() < 0.5 ? 'iso' : 'unix'),
        ip: randItem(IPS),
        method: randItem(METHODS),
        path: randItem(PATHS),
        status: Math.random() < 0.1 ? '-' : code,
        duration_ms: ms,
        user_agent: randItem(USER_AGENTS).replace(/"/g, '')
      };
      // Sometimes standard field name variations
      if (Math.random() < 0.5) {
        jsonFmt.responseTime = `${ms}ms`;
        delete jsonFmt.duration_ms;
      }
      return JSON.stringify(jsonFmt);

    } else if (subRoll < 0.85) {
      // 5. Totally malformed lines: blank lines, partial writes
      const malformedType = randInt(1, 3);
      if (malformedType === 1) {
        // Blank line
        return Math.random() < 0.5 ? '' : '   ';
      } else if (malformedType === 2) {
        // Truncated/partial write
        const parts = [
          generateTimestamp(baseDate, 'iso'),
          randItem(IPS),
          randItem(METHODS),
          randItem(PATHS)
        ];
        // slice some parts
        const sliceCount = randInt(1, 3);
        return parts.slice(0, sliceCount).join(' ');
      } else {
        // Suffix/Prefix garbage
        return `CRITICAL: database connection lost at ${generateTimestamp(baseDate, 'iso')}`;
      }

    } else {
      // 6. Multi-line stack traces (returns multiple lines joined by newlines)
      const stack = [
        `2024-03-15T14:23:01Z 192.168.1.42 ERROR Internal Server Error at path ${randItem(PATHS)}`,
        `Error: something broke in the controller`,
        `    at handleRequest (c:\\app\\src\\controller.js:24:12)`,
        `    at dispatch (c:\\app\\node_modules\\express\\lib\\router\\index.js:284:7)`,
        `    at next (c:\\app\\node_modules\\express\\lib\\router\\index.js:230:9)`,
        `    at Layer.handle [as handle_request] (c:\\app\\node_modules\\express\\lib\\router\\layer.js:95:5)`
      ];
      return stack.join('\n');
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const defaultFile = 'test_logs.log';
  const defaultCount = 10000;

  const targetFile = args[0] || defaultFile;
  const count = parseInt(args[1], 10) || defaultCount;

  console.log(`Generating ${count} lines into ${targetFile}...`);

  // Ensure output directory exists
  const dir = path.dirname(targetFile);
  if (dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const writeStream = fs.createWriteStream(targetFile, { encoding: 'utf8' });

  // Generate logs back in time, starting from oldest to newest (ascending timestamp order)
  for (let i = count; i >= 1; i--) {
    // Offset each line by ~1-5 seconds to simulate real-time traffic
    const offset = i * randInt(1, 3);
    const line = generateLine(offset);
    writeStream.write(line + '\n');
  }

  writeStream.end();
  writeStream.on('finish', () => {
    console.log(`Successfully generated ${count} log entries in ${targetFile}`);
  });

  writeStream.on('error', (err) => {
    console.error(`Failed to write log file: ${err.message}`);
  });
}

main();
