/**
 * Utility to expand roll number ranges like '21A91A0501-10' or '21A91A0501 to 21A91A0510'
 * and unpack comma/semicolon/newline-separated lists of roll numbers and ranges.
 */

const MAX_EXPANSION = 100;

/**
 * Parses and expands a roll number range string.
 * @param {string} rangeStr - The range string (e.g., '21A91A0501-10')
 * @returns {string[]|null} - Array of roll numbers or null if not a valid range
 */
export const expandRollNoRange = (rangeStr) => {
  if (!rangeStr || typeof rangeStr !== 'string') return null;

  // Normalize en-dash, em-dash, and tildes to standard hyphen
  const cleanStr = rangeStr
    .trim()
    .replace(/[–—~]/g, '-')
    .replace(/\s+/g, ' ');

  // Pattern 1: PREFIX-SUFFIX (e.g., 21A91A0501-10)
  const hyphenMatch = cleanStr.match(/^([A-Z0-9]+?\d+)\s*-\s*(\d+)$/i);
  if (hyphenMatch) {
    const fullStart = hyphenMatch[1];
    const endSuffix = hyphenMatch[2];

    // Extract the numeric part of the start roll number
    const startNumericMatch = fullStart.match(/(\d+)$/);
    if (!startNumericMatch) return null;

    const startValueStr = startNumericMatch[1];
    const prefix = fullStart.substring(0, fullStart.length - startValueStr.length);
    const startValue = parseInt(startValueStr, 10);
    const endValueRaw = parseInt(endSuffix, 10);

    let endValue = endValueRaw;

    // If endValue is smaller than start (e.g., 501-10),
    // it likely means the endSuffix replaces the last N digits.
    if (endValueRaw <= startValue && endSuffix.length < startValueStr.length) {
      const base = startValueStr.substring(0, startValueStr.length - endSuffix.length);
      endValue = parseInt(base + endSuffix, 10);

      // Safety: If after calculation endValue is still <= startValue,
      // increment the base (e.g., 99-01 meant for next hundred)
      if (endValue <= startValue) {
        const incrementedBase = parseInt(base, 10) + 1;
        endValue = parseInt(String(incrementedBase) + endSuffix, 10);
      }
    }

    return expand(prefix, startValue, endValue, startValueStr.length);
  }

  // Pattern 2: "ROLL1 to ROLL2" or "ROLL1 - ROLL2"
  const rangeMatch = cleanStr.match(/^([A-Z0-9]+)\s*(?:to|-)\s*([A-Z0-9]+)$/i);
  if (rangeMatch) {
    const startRoll = rangeMatch[1];
    const endRoll = rangeMatch[2];

    const startNumMatch = startRoll.match(/(\d+)$/);
    const endNumMatch = endRoll.match(/(\d+)$/);

    if (!startNumMatch || !endNumMatch) return null;

    const startValStr = startNumMatch[1];
    const prefix = startRoll.substring(0, startRoll.length - startValStr.length);
    const endPrefix = endRoll.substring(0, endRoll.length - endNumMatch[1].length);

    // Fix: Ensure prefixes match
    if (prefix.toUpperCase() !== endPrefix.toUpperCase()) return null;

    const startVal = parseInt(startValStr, 10);
    const endVal = parseInt(endNumMatch[1], 10);

    return expand(prefix, startVal, endVal, startValStr.length);
  }

  return null;
};

function expand(prefix, start, end, padding) {
  const diff = Math.abs(end - start);
  if (diff >= MAX_EXPANSION) return null;

  const result = [];
  const min = Math.min(start, end);
  const max = Math.max(start, end);

  for (let i = min; i <= max; i++) {
    const numPart = String(i).padStart(padding, '0');
    result.push(`${prefix}${numPart}`.toUpperCase());
  }

  return result;
}

export const isRange = (str) => {
  if (!str || typeof str !== 'string') return false;
  return /(-|[–—~]|\bto\b)/i.test(str) && /\d/.test(str);
};

/**
 * Unpacks a cell value that may contain a single roll number, a range,
 * or multiple comma/semicolon/newline-delimited rolls and ranges.
 * Example: '25MRA07001-05, 25MRA07010; 25MRA07015 to 25MRA07017'
 * @param {string} input
 * @returns {string[]} Array of unpacked individual roll numbers
 */
export const unpackRollList = (input) => {
  if (!input) return [];
  const str = String(input).trim();
  if (!str) return [];

  // Split on commas, semicolons, or newlines
  const tokens = str.split(/[,;\n\r]+/).map((t) => t.trim()).filter(Boolean);
  const result = [];

  for (const token of tokens) {
    if (isRange(token)) {
      const expanded = expandRollNoRange(token);
      if (expanded && expanded.length > 0) {
        result.push(...expanded);
        continue;
      }
    }
    // Clean token: remove spaces inside standard roll number
    const cleanRoll = token.replace(/\s+/g, '').toUpperCase();
    if (cleanRoll) {
      result.push(cleanRoll);
    }
  }

  // Deduplicate while preserving order
  return [...new Set(result)];
};
