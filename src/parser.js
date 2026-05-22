const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']);

// Regular expression to match IPv4 or IPv6 addresses. We ensure IPv6 has at least 3 colons or contains a double colon '::' so we don't accidentally match HH:MM:SS time strings.
const IP_REGEX = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b(?:[0-9a-fA-F]{1,4}:){3,7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){0,5}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}\b|\b::1\b|\bfe80::[0-9a-fA-F]{0,4}\b/;

/**
 * Normalizes different timestamp formats into ISO 8601 string.
 * Returns { isoString, anomalies } or throws an error.
 */
export function normalizeTimestamp(rawTs) {
  const ts = rawTs.trim();
  const anomalies = [];

  // 1. Unix epoch (e.g. 1710512581 or 1710512581.123)
  if (/^\d{9,13}(?:\.\d+)?$/.test(ts)) {
    anomalies.push('unix_epoch_timestamp');
    const val = parseFloat(ts);
    // If it's in seconds (typical 10 digits), convert to ms
    const ms = val < 10000000000 ? val * 1000 : val;
    const date = new Date(ms);
    if (isNaN(date.getTime())) throw new Error('Invalid Unix timestamp');
    return { isoString: date.toISOString(), anomalies };
  }

  // 2. Dash-Month format (e.g. 15-Mar-2024 14:23:01)
  const dashMonthMatch = ts.match(/^(\d{1,2})-(\w{3})-(\d{4})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/);
  if (dashMonthMatch) {
    anomalies.push('dash_month_timestamp_format');
    const [, day, monthStr, year, time] = dashMonthMatch;
    const monthNum = MONTH_MAP[monthStr.toLowerCase()];
    if (!monthNum) throw new Error(`Invalid month name: ${monthStr}`);
    const paddedDay = day.padStart(2, '0');
    // Assume UTC
    const date = new Date(`${year}-${monthNum}-${paddedDay}T${time}Z`);
    if (isNaN(date.getTime())) throw new Error('Invalid dash-month date');
    return { isoString: date.toISOString(), anomalies };
  }

  // 3. Slash format (e.g. 2024/03/15 14:23:01)
  const slashMatch = ts.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/);
  if (slashMatch) {
    anomalies.push('slash_timestamp_format');
    const [, year, month, day, time] = slashMatch;
    const date = new Date(`${year}-${month}-${day}T${time}Z`);
    if (isNaN(date.getTime())) throw new Error('Invalid slash date');
    return { isoString: date.toISOString(), anomalies };
  }

  // 4. ISO format (e.g. 2024-03-15T14:23:01Z or 2024-03-15T14:23:01.123Z)
  const date = new Date(ts);
  if (!isNaN(date.getTime())) {
    // If it doesn't match standard ISO, it could be slightly non-standard but parsable
    if (!ts.includes('T')) {
      anomalies.push('non_standard_iso_format');
    }
    return { isoString: date.toISOString(), anomalies };
  }

  throw new Error('Unsupported timestamp format');
}

/**
 * Normalizes duration strings (e.g. '142ms', '0.142s', '142') to milliseconds (number).
 */
export function normalizeDuration(rawDuration) {
  const dur = rawDuration.trim();
  
  if (dur.endsWith('ms')) {
    const ms = parseFloat(dur.slice(0, -2));
    if (isNaN(ms)) throw new Error('Invalid ms duration');
    return { ms, anomaly: null };
  }
  
  if (dur.endsWith('s')) {
    const sec = parseFloat(dur.slice(0, -1));
    if (isNaN(sec)) throw new Error('Invalid seconds duration');
    return { ms: Math.round(sec * 1000), anomaly: 'seconds_duration_unit' };
  }

  // Raw number (assumed ms)
  const ms = parseFloat(dur);
  if (isNaN(ms)) throw new Error('Invalid raw duration');
  return { ms, anomaly: 'raw_number_duration_unit' };
}

/**
 * Parses a single log line.
 * Returns an object with { success, line, data, anomalies, malformedReason }
 */
export function parseLine(line) {
  const trimmed = line.trim();

  // 1. Handle blank lines
  if (!trimmed) {
    return {
      success: false,
      line,
      data: null,
      anomalies: [],
      malformedReason: 'empty_line'
    };
  }

  // 2. Handle stack trace lines
  // These start with "at ", "Exception", or tabs/multiple spaces
  if (/^\s+(at\s+|Exception\s+|caused\s+by\s+|.*Exception:)/i.test(line) || line.startsWith('\t')) {
    return {
      success: false,
      line,
      data: null,
      anomalies: [],
      malformedReason: 'stack_trace_line'
    };
  }

  const anomalies = [];

  // 3. Attempt JSON parse
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      anomalies.push('json_format');

      // Extract timestamp
      const rawTs = parsed.timestamp || parsed['@timestamp'] || parsed.time || parsed.date || parsed.ts;
      if (!rawTs) throw new Error('JSON is missing timestamp field');
      const { isoString: timestamp, anomalies: tsAnomalies } = normalizeTimestamp(String(rawTs));
      anomalies.push(...tsAnomalies);

      // Extract IP
      const ip = parsed.ip || parsed.client_ip || parsed.clientIp || parsed.host || null;

      // Extract Method
      const method = String(parsed.method || parsed.http_method || '').toUpperCase();
      if (!method || !HTTP_METHODS.has(method)) throw new Error('JSON is missing or has invalid HTTP method');

      // Extract Path
      const path = parsed.path || parsed.url || parsed.uri || parsed.request;
      if (!path) throw new Error('JSON is missing path/request field');

      // Extract Status Code
      let status = null;
      const rawStatus = parsed.status !== undefined ? parsed.status : parsed.status_code || parsed.statusCode;
      if (rawStatus === '-' || rawStatus === null || rawStatus === undefined) {
        anomalies.push('missing_status_code');
      } else {
        status = parseInt(rawStatus, 10);
        if (isNaN(status)) {
          anomalies.push('missing_status_code');
          status = null;
        }
      }

      // Extract Duration
      let durationMs = 0;
      const rawDuration = parsed.duration !== undefined ? parsed.duration : parsed.duration_ms || parsed.responseTime || parsed.response_time;
      if (rawDuration !== undefined && rawDuration !== null) {
        const { ms, anomaly: durAnomaly } = normalizeDuration(String(rawDuration));
        durationMs = ms;
        if (durAnomaly) anomalies.push(durAnomaly);
      } else {
        anomalies.push('missing_duration');
      }

      // Extract extra fields (User Agent, referrers, etc.)
      const extra = {};
      const standardKeys = new Set([
        'timestamp', '@timestamp', 'time', 'date', 'ts',
        'ip', 'client_ip', 'clientIp', 'host',
        'method', 'http_method',
        'path', 'url', 'uri', 'request',
        'status', 'status_code', 'statusCode',
        'duration', 'duration_ms', 'responseTime', 'response_time', 'latency'
      ]);
      for (const [k, v] of Object.entries(parsed)) {
        if (!standardKeys.has(k)) {
          extra[k] = v;
        }
      }
      if (Object.keys(extra).length > 0) {
        anomalies.push('extra_fields');
      }

      return {
        success: true,
        line,
        data: {
          timestamp,
          ip,
          method,
          path,
          status,
          duration: durationMs,
          originalFormat: 'json',
          extra: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null
        },
        anomalies: [...new Set(anomalies)],
        malformedReason: null
      };
    } catch (err) {
      return {
        success: false,
        line,
        data: null,
        anomalies: [],
        malformedReason: `invalid_json: ${err.message}`
      };
    }
  }

  // 4. Standard log file parsing (space-delimited, varied formats)
  try {
    // We anchor parsing by locating the HTTP method and the IP address.
    // Finding IP address
    const ipMatch = trimmed.match(IP_REGEX);
    let ip = null;
    let ipIndex = -1;
    let ipLength = 0;
    
    if (ipMatch) {
      ip = ipMatch[0];
      ipIndex = ipMatch.index;
      ipLength = ip.length;
    } else {
      anomalies.push('missing_ip_address');
    }

    // Finding HTTP Method
    // We search for standard HTTP methods. If there are multiple, we look for the one after the IP address index.
    let method = null;
    let methodIndex = -1;
    let methodLength = 0;

    for (const m of HTTP_METHODS) {
      const idx = trimmed.indexOf(m, ipIndex !== -1 ? ipIndex + ipLength : 0);
      if (idx !== -1 && (methodIndex === -1 || idx < methodIndex)) {
        // Ensure it's a separate word (preceded/followed by space or quotes)
        const prevChar = idx > 0 ? trimmed[idx - 1] : ' ';
        const nextChar = idx + m.length < trimmed.length ? trimmed[idx + m.length] : ' ';
        if (/\s|["']/.test(prevChar) && /\s|["']/.test(nextChar)) {
          method = m;
          methodIndex = idx;
          methodLength = m.length;
        }
      }
    }

    // If method is not found, let's look anywhere in the line as fallback
    if (!method) {
      for (const m of HTTP_METHODS) {
        const idx = trimmed.indexOf(m);
        if (idx !== -1 && (methodIndex === -1 || idx < methodIndex)) {
          const prevChar = idx > 0 ? trimmed[idx - 1] : ' ';
          const nextChar = idx + m.length < trimmed.length ? trimmed[idx + m.length] : ' ';
          if (/\s|["']/.test(prevChar) && /\s|["']/.test(nextChar)) {
            method = m;
            methodIndex = idx;
            methodLength = m.length;
          }
        }
      }
    }

    if (!method) {
      return {
        success: false,
        line,
        data: null,
        anomalies: [],
        malformedReason: 'missing_http_method'
      };
    }

    // Determine Timestamp String
    let rawTs = '';
    if (ipIndex !== -1 && ipIndex > 0) {
      rawTs = trimmed.substring(0, ipIndex).trim();
    } else if (methodIndex > 0) {
      rawTs = trimmed.substring(0, methodIndex).trim();
    }

    if (!rawTs) {
      return {
        success: false,
        line,
        data: null,
        anomalies: [],
        malformedReason: 'missing_timestamp'
      };
    }

    const { isoString: timestamp, anomalies: tsAnomalies } = normalizeTimestamp(rawTs);
    anomalies.push(...tsAnomalies);

    // Extract path: immediately after the method
    const afterMethod = trimmed.substring(methodIndex + methodLength).trim();
    // Path is the first token, which should start with / or be a URL, or at least be non-empty
    const pathMatch = afterMethod.match(/^([^\s]+)/);
    if (!pathMatch) {
      return {
        success: false,
        line,
        data: null,
        anomalies: [],
        malformedReason: 'missing_path'
      };
    }

    const path = pathMatch[1];
    const remainder = afterMethod.substring(path.length).trim();

    // Parse status and duration from remainder
    // We expect: [Status] [Duration] [Extra Fields...]
    // Where status can be 3 digits, or '-', or omitted.
    // Duration can be numbers with 'ms' or 's', or raw numbers.
    // Let's use our robust regex:
    const remainderMatch = remainder.match(/^(?:([0-9]{3}|-)\s+)?([0-9]+(?:\.[0-9]+)?(?:ms|s|)?)(?:\s+(.*))?$/);

    let status = null;
    let durationMs = 0;
    let extra = null;

    if (remainderMatch) {
      const [, rawStatus, rawDuration, rawExtra] = remainderMatch;
      
      // Status Code
      if (!rawStatus || rawStatus === '-') {
        anomalies.push('missing_status_code');
      } else {
        status = parseInt(rawStatus, 10);
      }

      // Duration
      if (rawDuration) {
        const { ms, anomaly: durAnomaly } = normalizeDuration(rawDuration);
        durationMs = ms;
        if (durAnomaly) anomalies.push(durAnomaly);
      } else {
        anomalies.push('missing_duration');
      }

      // Extra fields
      if (rawExtra) {
        extra = rawExtra.trim();
        anomalies.push('extra_fields');
      }
    } else {
      // Fallback: remainder doesn't match standard patterns.
      // Maybe status code is missing and duration is also missing or malformed.
      anomalies.push('missing_status_code');
      anomalies.push('missing_duration');
      if (remainder) {
        extra = remainder;
        anomalies.push('extra_fields');
      }
    }

    return {
      success: true,
      line,
      data: {
        timestamp,
        ip,
        method,
        path,
        status,
        duration: durationMs,
        originalFormat: 'standard',
        extra
      },
      anomalies: [...new Set(anomalies)],
      malformedReason: null
    };

  } catch (err) {
    return {
      success: false,
      line,
      data: null,
      anomalies: [],
      malformedReason: `parse_error: ${err.message}`
    };
  }
}
