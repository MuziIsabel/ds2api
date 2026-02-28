'use strict';

const TOOL_CALL_PATTERN = /\{\s*["']tool_calls["']\s*:\s*\[(.*?)\]\s*\}/s;

const {
  toStringSafe,
  looksLikeToolExampleContext,
} = require('./state');
const {
  extractJSONObjectFrom,
} = require('./jsonscan');

function extractToolNames(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return [];
  }
  const out = [];
  for (const t of tools) {
    if (!t || typeof t !== 'object') {
      continue;
    }
    const fn = t.function && typeof t.function === 'object' ? t.function : t;
    const name = toStringSafe(fn.name);
    // Keep parity with Go injectToolPrompt: object tools without name still
    // enter tool mode via fallback name "unknown".
    out.push(name || 'unknown');
  }
  return out;
}

function parseToolCalls(text, toolNames) {
  return parseToolCallsDetailed(text, toolNames).calls;
}

function parseToolCallsDetailed(text, toolNames) {
  const result = emptyParseResult();
  if (!toStringSafe(text)) {
    return result;
  }
  const sanitized = stripFencedCodeBlocks(text);
  if (!toStringSafe(sanitized)) {
    return result;
  }
  result.sawToolCallSyntax = sanitized.toLowerCase().includes('tool_calls');

  const candidates = buildToolCallCandidates(sanitized);
  let parsed = [];
  for (const c of candidates) {
    parsed = parseToolCallsPayload(c);
    if (parsed.length > 0) {
      result.sawToolCallSyntax = true;
      break;
    }
  }
  if (parsed.length === 0) {
    return result;
  }

  const filtered = filterToolCallsDetailed(parsed, toolNames);
  result.calls = filtered.calls;
  result.rejectedToolNames = filtered.rejectedToolNames;
  result.rejectedByPolicy = filtered.rejectedToolNames.length > 0 && filtered.calls.length === 0;
  return result;
}

function stripFencedCodeBlocks(text) {
  const t = typeof text === 'string' ? text : '';
  if (!t) {
    return '';
  }
  return t.replace(/```[\s\S]*?```/g, ' ');
}

function parseStandaloneToolCalls(text, toolNames) {
  return parseStandaloneToolCallsDetailed(text, toolNames).calls;
}

function parseStandaloneToolCallsDetailed(text, toolNames) {
  const result = emptyParseResult();
  const trimmed = toStringSafe(text);
  if (!trimmed) {
    return result;
  }
  if (looksLikeToolExampleContext(trimmed)) {
    return result;
  }
  result.sawToolCallSyntax = trimmed.toLowerCase().includes('tool_calls');
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return result;
  }

  const parsed = parseToolCallsPayload(trimmed);
  if (parsed.length === 0) {
    return result;
  }

  result.sawToolCallSyntax = true;
  const filtered = filterToolCallsDetailed(parsed, toolNames);
  result.calls = filtered.calls;
  result.rejectedToolNames = filtered.rejectedToolNames;
  result.rejectedByPolicy = filtered.rejectedToolNames.length > 0 && filtered.calls.length === 0;
  return result;
}

function emptyParseResult() {
  return {
    calls: [],
    sawToolCallSyntax: false,
    rejectedByPolicy: false,
    rejectedToolNames: [],
  };
}

function buildToolCallCandidates(text) {
  const trimmed = toStringSafe(text);
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/gi) || [];
  for (const block of fenced) {
    const m = block.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (m && m[1]) {
      candidates.push(toStringSafe(m[1]));
    }
  }
  for (const candidate of extractToolCallObjects(trimmed)) {
    candidates.push(toStringSafe(candidate));
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    candidates.push(toStringSafe(trimmed.slice(first, last + 1)));
  }
  const m = trimmed.match(TOOL_CALL_PATTERN);
  if (m && m[1]) {
    candidates.push(`{"tool_calls":[${m[1]}]}`);
  }
  return [...new Set(candidates.filter(Boolean))];
}

function extractToolCallObjects(text) {
  const raw = toStringSafe(text);
  if (!raw) {
    return [];
  }
  const lower = raw.toLowerCase();
  const out = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let idx = lower.indexOf('tool_calls', offset);
    if (idx < 0) {
      break;
    }
    let start = raw.slice(0, idx).lastIndexOf('{');
    while (start >= 0) {
      const obj = extractJSONObjectFrom(raw, start);
      if (obj.ok) {
        out.push(raw.slice(start, obj.end).trim());
        offset = obj.end;
        idx = -1;
        break;
      }
      start = raw.slice(0, start).lastIndexOf('{');
    }
    if (idx >= 0) {
      offset = idx + 'tool_calls'.length;
    }
  }
  return out;
}

function parseToolCallsPayload(payload) {
  let decoded;
  try {
    decoded = JSON.parse(payload);
  } catch (_err) {
    return [];
  }
  if (Array.isArray(decoded)) {
    return parseToolCallList(decoded);
  }
  if (!decoded || typeof decoded !== 'object') {
    return [];
  }
  if (decoded.tool_calls) {
    return parseToolCallList(decoded.tool_calls);
  }
  const one = parseToolCallItem(decoded);
  return one ? [one] : [];
}

function parseToolCallList(v) {
  if (!Array.isArray(v)) {
    return [];
  }
  const out = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const one = parseToolCallItem(item);
    if (one) {
      out.push(one);
    }
  }
  return out;
}

function parseToolCallItem(m) {
  let name = toStringSafe(m.name);
  let inputRaw = m.input;
  let hasInput = Object.prototype.hasOwnProperty.call(m, 'input');
  const fn = m.function && typeof m.function === 'object' ? m.function : null;
  if (fn) {
    if (!name) {
      name = toStringSafe(fn.name);
    }
    if (!hasInput && Object.prototype.hasOwnProperty.call(fn, 'arguments')) {
      inputRaw = fn.arguments;
      hasInput = true;
    }
  }
  if (!hasInput) {
    for (const k of ['arguments', 'args', 'parameters', 'params']) {
      if (Object.prototype.hasOwnProperty.call(m, k)) {
        inputRaw = m[k];
        hasInput = true;
        break;
      }
    }
  }
  if (!name) {
    return null;
  }
  return {
    name,
    input: parseToolCallInput(inputRaw),
  };
}

function parseToolCallInput(v) {
  if (v == null) {
    return {};
  }
  if (typeof v === 'string') {
    const raw = toStringSafe(v);
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return { _raw: raw };
    } catch (_err) {
      return { _raw: raw };
    }
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    return v;
  }
  try {
    const parsed = JSON.parse(JSON.stringify(v));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_err) {
    return {};
  }
  return {};
}

function filterToolCallsDetailed(parsed, toolNames) {
  const allowed = new Set();
  const allowedCanonical = new Map();
  for (const item of toolNames || []) {
    const name = toStringSafe(item);
    if (!name) {
      continue;
    }
    allowed.add(name);
    const lower = name.toLowerCase();
    if (!allowedCanonical.has(lower)) {
      allowedCanonical.set(lower, name);
    }
  }

  if (allowed.size === 0) {
    const rejected = [];
    const seen = new Set();
    for (const tc of parsed) {
      if (!tc || !tc.name) {
        continue;
      }
      if (seen.has(tc.name)) {
        continue;
      }
      seen.add(tc.name);
      rejected.push(tc.name);
    }
    return { calls: [], rejectedToolNames: rejected };
  }

  const calls = [];
  const rejected = [];
  const seenRejected = new Set();
  for (const tc of parsed) {
    if (!tc || !tc.name) {
      continue;
    }
    let matchedName = '';
    if (allowed.has(tc.name)) {
      matchedName = tc.name;
    } else {
      matchedName = allowedCanonical.get(tc.name.toLowerCase()) || '';
    }
    if (!matchedName) {
      if (!seenRejected.has(tc.name)) {
        seenRejected.add(tc.name);
        rejected.push(tc.name);
      }
      continue;
    }
    calls.push({
      name: matchedName,
      input: tc.input && typeof tc.input === 'object' && !Array.isArray(tc.input) ? tc.input : {},
    });
  }
  return { calls, rejectedToolNames: rejected };
}

module.exports = {
  extractToolNames,
  parseToolCalls,
  parseToolCallsDetailed,
  parseStandaloneToolCalls,
  parseStandaloneToolCallsDetailed,
};
