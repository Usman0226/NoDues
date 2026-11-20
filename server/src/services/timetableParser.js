import { PDFParse } from 'pdf-parse';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import logger from '../utils/logger.js';

/**
 * Normalizes faculty names for reliable fuzzy matching.
 * Strips honorifics, punctuation, multiple spaces, and converts to lowercase.
 * TRD Reference: FR-C5
 *
 * @param {string} rawName
 * @returns {string}
 */
export function normalizeFacultyName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';

  return rawName
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // strip parenthetical designations e.g. (HOD), (CSE), [Visiting]
    .replace(/\b(dr|prof|professor|assoc\s*prof|asst\s*prof|mr|mrs|ms|er|sri|smt|kum|kumari|hod|dean|incharge|visiting|ph\.?d\.?|m\.?tech|m\.?sc)\b\.?/gi, '') // strip honorifics & titles
    .replace(/[^\w\s]/g, '') // remove punctuation/dots
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Returns alphabetically sorted word tokens of the normalized faculty name
 * for order-independent fuzzy matching (e.g. 'Ramanathan P' matches 'P Ramanathan').
 */
export function getTokenSortedName(rawName) {
  const norm = normalizeFacultyName(rawName);
  if (!norm) return '';
  return norm.split(' ').filter(Boolean).sort().join(' ');
}

/**
 * Checks if faculty name represents an unassigned course ("without teacher", "TBD", "Vacant", etc.).
 * TRD Reference: FR-C3
 *
 * @param {string} facultyName
 * @returns {boolean}
 */
export function isWithoutTeacher(facultyName) {
  if (!facultyName) return true;
  const normalized = facultyName.toLowerCase().replace(/[^a-z]/g, '');
  const unassignedKeys = [
    'withoutteacher',
    'noteacher',
    'tbd',
    'tba',
    'nil',
    'na',
    'vacant',
    'guestfaculty',
    'unassigned',
    'notappointed',
    'none',
    'staff',
    'todecide',
    'tobearranged',
  ];
  return unassignedKeys.includes(normalized);
}

/**
 * Extracts class and header metadata from a timetable page.
 * Detects patterns like:
 * - "III CSD A I SEM" -> Year: III, Dept: CSD, Section: A, Sem: 5
 * - "IV CSD B I SEM" -> Year: IV, Dept: CSD, Section: B, Sem: 7
 * - "II CSD A II SEM" -> Year: II, Dept: CSD, Section: A, Sem: 4
 * - "Class Teacher: <Name>"
 * - "Academic Year: <Year>"
 * - "Department of <Name>"
 */
export function extractClassMetadataFromText(text) {
  if (!text || typeof text !== 'string') return {};

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const header = lines[0] || '';

  let detectedClassName = null;
  let displayName = null;
  let detectedSemester = null;
  let detectedDepartment = null;

  const RESERVED_WORDS = new Set([
    'YEAR', 'YR', 'BTECH', 'BE', 'MTECH', 'MBA', 'MCA',
    'SEMESTER', 'SEM', 'TIME', 'TABLE', 'TIMETABLE',
    'SECTION', 'SEC', 'ROOM', 'DEPT', 'DEPARTMENT', 'CLASS', 'BATCH'
  ]);

  // Pattern 1: Roman Year + Dept + Section + Roman Sem (e.g. "III CSD A I SEM")
  const romanPattern = /\b(IV|III|II|I)\b\s+([A-Za-z]+)\s+([A-Za-z0-9]+)\s+\b(II|I)\b\s+SEM\b/i;
  const romanMatch = header.match(romanPattern) || text.match(romanPattern);
  if (romanMatch) {
    const yearRoman = romanMatch[1].toUpperCase();
    const deptCode = romanMatch[2].toUpperCase();
    const sec = romanMatch[3].toUpperCase();
    const semRoman = romanMatch[4].toUpperCase();
    if (!RESERVED_WORDS.has(deptCode) && !RESERVED_WORDS.has(sec)) {
      const yearNum = { I: 1, II: 2, III: 3, IV: 4 }[yearRoman] || 1;
      const semInYear = semRoman === 'II' ? 2 : 1;
      detectedSemester = (yearNum - 1) * 2 + semInYear;
      detectedClassName = `${deptCode}-${sec}`;
      displayName = `${yearRoman} ${deptCode}-${sec}`;
      detectedDepartment = deptCode;
    }
  }

  // Pattern 1B: "III B.Tech I Semester (CSD - A)" or "II B.Tech II Sem (CSE - B)"
  if (!detectedClassName) {
    const btechPattern = /\b(IV|III|II|I)\b\s*(?:B\.?Tech|B\.?E\.?)\s*(?:[-–—\s]*)(?:Year|Yr)?\s*\b(II|I)?\b\s*(?:Semester|Sem)?\s*[\(\[]?\s*([A-Za-z]+)\s*[-_/\s]\s*([A-Za-z0-9]+)\s*[\)\]]?/i;
    const btechMatch = text.match(btechPattern);
    if (btechMatch) {
      const yearRoman = btechMatch[1].toUpperCase();
      const semRoman = (btechMatch[2] || 'I').toUpperCase();
      const deptCode = btechMatch[3].toUpperCase();
      const sec = btechMatch[4].toUpperCase();
      if (!RESERVED_WORDS.has(deptCode) && !RESERVED_WORDS.has(sec)) {
        const yearNum = { I: 1, II: 2, III: 3, IV: 4 }[yearRoman] || 1;
        const semInYear = semRoman === 'II' ? 2 : 1;
        detectedSemester = (yearNum - 1) * 2 + semInYear;
        detectedClassName = `${deptCode}-${sec}`;
        displayName = `${yearRoman} ${deptCode}-${sec}`;
        detectedDepartment = deptCode;
      }
    }
  }

  // Pattern 1C: "B.Tech II Year I Semester (CSD - A)" or "B.Tech III Year II Sem (AIML - B)"
  if (!detectedClassName) {
    const btechFirstPattern = /(?:B\.?Tech|B\.?E\.?|M\.?Tech)\s*[-–—\s]*\b(IV|III|II|I)\b\s*(?:Year|Yr)?\s*\b(II|I)?\b\s*(?:Semester|Sem)?\s*[\(\[]?\s*([A-Za-z]+)\s*[-_/\s]\s*([A-Za-z0-9]+)\s*[\)\]]?/i;
    const btechFirstMatch = text.match(btechFirstPattern);
    if (btechFirstMatch) {
      const yearRoman = btechFirstMatch[1].toUpperCase();
      const semRoman = (btechFirstMatch[2] || 'I').toUpperCase();
      const deptCode = btechFirstMatch[3].toUpperCase();
      const sec = btechFirstMatch[4].toUpperCase();
      if (!RESERVED_WORDS.has(deptCode) && !RESERVED_WORDS.has(sec)) {
        const yearNum = { I: 1, II: 2, III: 3, IV: 4 }[yearRoman] || 1;
        const semInYear = semRoman === 'II' ? 2 : 1;
        detectedSemester = (yearNum - 1) * 2 + semInYear;
        detectedClassName = `${deptCode}-${sec}`;
        displayName = `${yearRoman} ${deptCode}-${sec}`;
        detectedDepartment = deptCode;
      }
    }
  }

  // Pattern 1D: Explicit "SECTION: CSE-A" or "SECTION : CSD - B"
  const explicitSecMatch = text.match(/\b(?:section|sec)\s*[:\-–—]\s*([A-Za-z0-9]+(?:[-_/\s][A-Za-z0-9]+)?)\b/i);
  if (explicitSecMatch) {
    const rawSec = explicitSecMatch[1].replace(/\s+/g, '').toUpperCase();
    if (rawSec.includes('-')) {
      const [secDept, secCode] = rawSec.split('-');
      if (!RESERVED_WORDS.has(secDept) && !RESERVED_WORDS.has(secCode)) {
        detectedClassName = `${secDept}-${secCode}`;
        detectedDepartment = detectedDepartment || secDept;
      }
    } else if (!RESERVED_WORDS.has(rawSec)) {
      if (!detectedClassName) {
        detectedClassName = rawSec;
      }
    }
  }

  // Pattern 2: "III CSD-A" or "III CSE B" without Sem on same line (guarded by RESERVED_WORDS)
  if (!detectedClassName) {
    const simpleClassMatch = header.match(/\b(IV|III|II|I)\b\s+([A-Za-z]+)[-\s]+([A-Za-z0-9]+)\b/i);
    if (simpleClassMatch) {
      const yearRoman = simpleClassMatch[1].toUpperCase();
      const deptCode = simpleClassMatch[2].toUpperCase();
      const sec = simpleClassMatch[3].toUpperCase();
      if (!RESERVED_WORDS.has(deptCode) && !RESERVED_WORDS.has(sec)) {
        detectedClassName = `${deptCode}-${sec}`;
        displayName = `${yearRoman} ${deptCode}-${sec}`;
        detectedDepartment = deptCode;
      }
    }
  }

  // Fallback: Detect Semester number or Roman numeral
  if (!detectedSemester) {
    const yearSemMatch = text.match(/\b(IV|III|II|I)\b\s*(?:B\.?Tech|B\.?E\.?|M\.?Tech|Year|Yr)?\s*(?:[-–—\s]*)\b(II|I)\b\s*(?:Semester|Sem)\b/i);
    if (yearSemMatch) {
      const yearRoman = yearSemMatch[1].toUpperCase();
      const semRoman = yearSemMatch[2].toUpperCase();
      const yearNum = { I: 1, II: 2, III: 3, IV: 4 }[yearRoman] || 1;
      const semInYear = semRoman === 'II' ? 2 : 1;
      detectedSemester = (yearNum - 1) * 2 + semInYear;
    } else {
      const semDigitMatch = text.match(/\b(?:semester|sem)[-:\s]+([1-8]|I|II|III|IV|V|VI|VII|VIII)\b/i)
        || text.match(/\b(VIII|VII|VI|V|IV|III|II|I)\s+(?:semester|sem)\b/i);
      if (semDigitMatch) {
        const semVal = semDigitMatch[1].toUpperCase();
        const romanSemMap = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
        detectedSemester = romanSemMap[semVal] || parseInt(semVal, 10) || null;
      }
    }
  }

  // Fallback: Section name if still not resolved
  if (!detectedClassName) {
    const secMatch = text.match(/\b(?:section|sec)[-:\s]+([A-Z0-9]+(?:-[A-Z0-9]{1,4})?)\b/i);
    if (secMatch) {
      const candidate = secMatch[1].toUpperCase();
      if (!RESERVED_WORDS.has(candidate)) {
        detectedClassName = candidate;
        displayName = detectedClassName.includes('-') ? detectedClassName : `Section ${detectedClassName}`;
      }
    }
  }

  const ctMatch = text.match(/(?:Class Teacher|Class In-?charge|Class Mentor|In-?charge)\s*[:\-–—]\s*([^\t\r\n]+)/i);
  const ayMatch = text.match(/(?:Academic Year|A\.?Y\.?)\s*[:\-–—]?\s*([0-9]{4}\s*[-–—/]\s*[0-9]{2,4})/i)
    || text.match(/\b(20\d{2}\s*[-–—/]\s*(?:20\d{2}|\d{2}))\b/);
  const deptMatch = text.match(/(?:Department of|Dept\.? of)\s*([^\t\r\n\(\)]+)/i);

  return {
    detectedClassName,
    displayName: displayName || detectedClassName,
    detectedSemester,
    detectedTeacher: ctMatch ? ctMatch[1].trim() : null,
    detectedAcademicYear: ayMatch ? ayMatch[1].trim() : null,
    detectedDepartment: detectedDepartment || (deptMatch ? deptMatch[1].trim() : null),
  };
}

/**
 * Parses hours or periods from timetable column.
 * Supports integer values as well as L-T-P or L+T+P formats (e.g. 3-0-0 -> 3, 3-1-0 -> 4, 3+1 -> 4).
 */
export function parseTimetableHours(hoursCol) {
  if (!hoursCol) return 0;
  const s = String(hoursCol).trim();
  // Support L-T-P, L-T-P-C, L+T+P, or slash patterns (e.g. 3-0-0, 3-1-0, 3+1, 3/0/0)
  const parts = s.split(/[-+–—/]/).map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n));
  if (parts.length > 1) {
    return parts.reduce((sum, n) => sum + n, 0);
  }
  const single = parseInt(s, 10);
  return !isNaN(single) ? single : 0;
}

/**
 * Parses raw text lines to detect subject summary table rows.
 * Supports both high-precision aSc tab-delimited tables and fallback line-by-line regex.
 * Extracts: subjectCode, subjectName, facultyName, hours, isElective.
 * Merges split theory/tutorial rows under the same subject code & faculty.
 * TRD Reference: FR-C1
 *
 * @param {string} text
 * @returns {Array<Object>}
 */
export function extractTableRowsFromText(text) {
  if (!text || typeof text !== 'string') return [];

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  // 1. High-precision bounded table extraction (aSc Timetables structure & variants)
  const headerIdx = lines.findIndex(l =>
    /(?:Subject|Course|Sub\.?)\s*(?:Name|Title|Code)?.*(?:Faculty|Teacher|Staff|Instructor)/i.test(l) ||
    /(?:Faculty|Teacher|Staff|Instructor).*Course/i.test(l)
  );
  let footerIdx = lines.findIndex((l, idx) => {
    if (idx <= headerIdx) return false;
    // A table row starting with a serial number or containing a subject code is NOT a signature line
    if (/^[0-9]+[\s\t]/.test(l) || /\b[0-9]{2}[A-Z]{2,}/i.test(l)) return false;
    return /(?:Time\s*Table\s*In-?charge|Principal|Head\s+of\s+the\s+Department|\bHOD\b|Dean|Director|Academic\s*Coordinator|Coordinator)/i.test(l);
  });

  if (headerIdx !== -1 && footerIdx === -1) {
    // If table starts but no standard footer signature is present, take lines until end
    footerIdx = lines.length;
  }

  if (headerIdx !== -1 && footerIdx !== -1 && footerIdx > headerIdx) {
    const tableLines = lines.slice(headerIdx + 1, footerIdx);
    const rawParsed = [];

    for (const line of tableLines) {
      let parts = line.split('\t').map(s => s.trim());
      if (parts.length < 2 && line.includes('|')) {
        parts = line.split('|').map(s => s.trim()).filter(Boolean);
      }
      if (parts.length < 2) {
        parts = line.split(/\s{3,}/).map(s => s.trim()).filter(Boolean);
      }
      if (parts.length < 2) continue;

      // Handle leading serial number column (e.g. S.No in parts[0])
      let colIdx = 0;
      if (/^[0-9]{1,3}$/.test(parts[0]) && parts.length >= 3 && !/[A-Za-z]{2}/.test(parts[0])) {
        colIdx = 1;
      }

      const subjectCol = parts[colIdx] || '';
      const facultyCol = parts[colIdx + 1] || 'Without teacher';
      const hoursCol = parts[colIdx + 2] || parts[parts.length - 1] || '0';
      const hours = parseTimetableHours(hoursCol);

      let subjectCode = '';
      let subjectName = '';
      let isElective = false;

      // Extract standard code pattern (e.g. 23PHY102, 23CSD107, 23CSD4M01, 23CSD604, 20CS501, 19A05501T, CS8591, PE-I, OE-1)
      const codeMatch = subjectCol.match(/\b([0-9]{2}[A-Z]{2,5}(?=[A-Z0-9]*[0-9])[A-Z0-9]{2,8}|[A-Z]{2,5}[- ]?[0-9]{3,5}[A-Z]?|PE\s*[-–—]?[0-9IV]+|OE\s*[-–—]?[0-9IV]+)\b/i);
      if (codeMatch) {
        subjectCode = codeMatch[1].toUpperCase().replace(/\s+/g, '');
        subjectName = subjectCol.replace(codeMatch[0], '').replace(/^[\s\-–—:]+/, '').trim();
        if (
          /PE\s*[-I|IV|V0-9]|\bMOOC\b|\bElective\b|\bOE\s*[-I|IV|V0-9]/i.test(subjectCol) ||
          /^[0-9]{2}[A-Z]{2,4}\d+[MEO]\d+[A-Z]?$/i.test(subjectCode) ||
          /^(PE|OE)[-0-9IV]+$/i.test(subjectCode)
        ) {
          isElective = true;
        }
      } else {
        // Non-standard subject keywords
        if (/^SS\b|^Soft Skill/i.test(subjectCol)) {
          subjectCode = 'SS';
          subjectName = 'Soft Skill';
        } else if (/^APS\b|^Aptitude/i.test(subjectCol)) {
          subjectCode = 'APS';
          subjectName = 'Aptitude';
        } else if (/^Code\s*Tantra/i.test(subjectCol)) {
          subjectCode = 'Code Tantra';
          subjectName = 'Code Tantra';
        } else if (/^HA\b|^Holistic/i.test(subjectCol)) {
          subjectCode = 'HA';
          subjectName = 'Holistic Activities';
        } else if (/^OE\s*[-I|IV|V0-9]/i.test(subjectCol)) {
          const oeMatch = subjectCol.match(/^(OE\s*[-I|IV|V0-9]+)/i);
          subjectCode = oeMatch ? oeMatch[1].toUpperCase().replace(/\s+/g, '') : 'OE';
          subjectName = 'Open Elective';
          isElective = true;
        } else {
          subjectCode = subjectCol.slice(0, 15).trim();
          subjectName = subjectCol;
        }
      }

      rawParsed.push({
        rawLine: line,
        subjectCode,
        subjectName: subjectName || subjectCode,
        facultyField: facultyCol,
        hours,
        isElective,
      });
    }

    // Split-Row Merging: merge identical subjectCode + primary faculty
    const mergedRows = [];
    const mergeMap = new Map();

    for (const item of rawParsed) {
      const primaryFaculty = (item.facultyField.split(/[,/&]|\band\b/i)[0] || '').trim().toLowerCase();
      const mergeKey = `${item.subjectCode}::${primaryFaculty}`;

      if (mergeMap.has(mergeKey)) {
        const existing = mergeMap.get(mergeKey);
        existing.hours += item.hours;

        // Combine co-faculty names without duplicates
        const existingFaculties = existing.facultyField.split(/[,/&]|\band\b/i).map(f => f.trim()).filter(Boolean);
        const newFaculties = item.facultyField.split(/[,/&]|\band\b/i).map(f => f.trim()).filter(Boolean);
        const combined = Array.from(new Set([...existingFaculties, ...newFaculties]));
        existing.facultyField = combined.join(', ');
      } else {
        const copy = { ...item };
        mergeMap.set(mergeKey, copy);
        mergedRows.push(copy);
      }
    }

    return mergedRows;
  }

  // 2. Generic fallback for unstructured or synthetic fixture text
  const parsedRows = [];
  const subjectCodePattern = /\b([0-9]{2}[A-Z]{2,5}(?=[A-Z0-9]*[0-9])[A-Z0-9]{2,8}|[A-Z]{2,5}[- ]?[0-9]{3,5}[A-Z]?|PE\s*[-–—]?[0-9IV]+|OE\s*[-–—]?[0-9IV]+)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line contains a subject code
    const codeMatch = line.match(subjectCodePattern);
    if (!codeMatch) continue;

    const subjectCode = codeMatch[1].toUpperCase().replace(/\s+/g, '');

    // Skip table header lines
    if (/code|subject|faculty|hours|s\.?no/i.test(line) && line.length < 50 && !/\d{2,}/.test(line)) {
      continue;
    }

    // Split line or inspect parts around the code
    const lineWithoutCode = line.replace(codeMatch[0], '').trim();

    // Look for hours at the end (integer or L-T-P like 3-0-0)
    let hours = 0;
    let nameAndFaculty = lineWithoutCode;
    const hoursMatch = lineWithoutCode.match(/\b([0-9]+(?:\s*[-+–—/]\s*[0-9]+)?)\s*$/);
    if (hoursMatch) {
      hours = parseTimetableHours(hoursMatch[1]);
      nameAndFaculty = lineWithoutCode.slice(0, hoursMatch.index).trim();
    }

    let subjectName = '';
    let facultyField = '';

    const delimiterMatch = nameAndFaculty.match(/\s+[-–—/]\s+|\t+|\s{3,}/);
    if (delimiterMatch) {
      const parts = nameAndFaculty.split(delimiterMatch[0]);
      subjectName = parts[0].trim();
      facultyField = parts.slice(1).join(' ').trim();
    } else {
      const honorificMatch = nameAndFaculty.match(/\b(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.|Er\.)\b/i);
      if (honorificMatch && honorificMatch.index > 3) {
        subjectName = nameAndFaculty.slice(0, honorificMatch.index).trim();
        facultyField = nameAndFaculty.slice(honorificMatch.index).trim();
      } else {
        subjectName = nameAndFaculty;
        facultyField = '';
      }
    }

    if (subjectCode && (subjectName || facultyField)) {
      const fallbackElective =
        /PE\s*[-I|IV|V0-9]|\bMOOC\b|\bElective\b|\bOE\s*[-I|IV|V0-9]/i.test(line) ||
        /^[0-9]{2}[A-Z]{2,4}\d+[MEO]\d+[A-Z]?$/i.test(subjectCode) ||
        /^(PE|OE)[-0-9IV]+$/i.test(subjectCode);
      parsedRows.push({
        rawLine: line,
        subjectCode,
        subjectName: subjectName || subjectCode,
        facultyField: facultyField || 'Without Teacher',
        hours: hours || 0,
        isElective: fallbackElective,
      });
    }
  }

  return parsedRows;
}

/**
 * Inspects an uploaded PDF document to discover page count, text layers, headers,
 * and calculate relevance recommendations for a target class.
 *
 * @param {Buffer} pdfBuffer
 * @param {Object} options - { targetClassName, semester, departmentId }
 * @returns {Promise<Object>}
 */
export async function inspectPdfPages(pdfBuffer, options = {}) {
  const startTime = Date.now();

  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    const error = new Error('Invalid PDF buffer provided.');
    error.code = 'VAL_001';
    error.statusCode = 400;
    throw error;
  }

  // Quick signature check
  const headerCheck = pdfBuffer.slice(0, 8).toString('utf-8');
  if (!headerCheck.includes('%PDF-')) {
    const error = new Error('Uploaded file is not a valid PDF document (missing PDF magic header).');
    error.code = 'VAL_001';
    error.statusCode = 400;
    throw error;
  }

  let parser;
  let textResult;
  try {
    parser = new PDFParse({ data: pdfBuffer });
    textResult = await parser.getText();
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('password') || msg.includes('encrypt') || msg.includes('security')) {
      const error = new Error('The uploaded PDF is password-protected. Please upload an unlocked PDF document.');
      error.code = 'VAL_001';
      error.statusCode = 400;
      throw error;
    }
    const error = new Error(`Failed to parse PDF document structure: ${err.message}`);
    error.code = 'VAL_001';
    error.statusCode = 400;
    throw error;
  }

  const pageCount = textResult?.total || textResult?.pages?.length || 1;
  const rawPages = textResult?.pages || [];

  // Subject code regex pattern (supports standard & alphanumeric minor/elective codes like 23CSD4M01)
  const subjectCodePattern = /\b([0-9]{2}[A-Z]{2,4}(?=[A-Z0-9]*[0-9])[A-Z0-9]{2,6}|[A-Z]{2,5}[- ]?[0-9]{3,4}[A-Z]?)\b/gi;

  // Prepare tokens for recommendation scoring
  const targetName = (options.targetClassName || '').trim().toLowerCase();
  const targetSem = options.semester ? String(options.semester) : '';

  // Extract section token (e.g. "A", "B", "C" from "CSE-A" or "Section A")
  let targetSectionToken = '';
  const secMatch = targetName.match(/(?:section|sec|[-_/\s])\s*([a-z0-9]+)$/i) || targetName.match(/\b([a-z])\b/i);
  if (secMatch) {
    targetSectionToken = secMatch[1].toLowerCase();
  }

  const inspectedPages = [];
  let highestScore = -1;
  let bestPageNumber = 1;

  for (let idx = 0; idx < rawPages.length; idx++) {
    const p = rawPages[idx];
    const pageNum = p.num || idx + 1;
    const pageText = (p.text || '').trim();
    const textLength = pageText.length;
    const hasTextLayer = textLength >= 25;

    const lines = pageText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Header extraction: find first meaningful header line
    let detectedHeader = '';
    for (const line of lines) {
      if (line.length > 5 && !line.match(/^[0-9]+$/)) {
        detectedHeader = line;
        break;
      }
    }
    if (!detectedHeader && lines.length > 0) {
      detectedHeader = lines[0];
    }
    if (detectedHeader.length > 80) {
      detectedHeader = detectedHeader.slice(0, 77) + '...';
    }

    // Snippet preview (first ~160 chars)
    const snippet = lines.slice(0, 3).join(' · ').slice(0, 160);

    // Detect subject codes on this page
    const foundCodes = new Set();
    let match;
    const codeRegexCopy = new RegExp(subjectCodePattern.source, 'gi');
    while ((match = codeRegexCopy.exec(pageText)) !== null) {
      foundCodes.add(match[1].toUpperCase().replace(/\s+/g, ''));
      if (foundCodes.size >= 8) break; // cap preview list
    }

    // Recommendation scoring
    let score = 0;
    const lowerText = pageText.toLowerCase();

    if (hasTextLayer) {
      score += 10;

      // Penalize non-class administrative pages so they are never recommended over section timetables
      if (/master\s*time\s*table|general\s*instruction|lab\s*protocol|bell\s*timing|allocation\s*matrix/i.test(lowerText)) {
        score -= 60;
      }

      // Exact class name in text
      if (targetName && lowerText.includes(targetName)) {
        score += 80;
      }

      // Target section matching (e.g. "section a", "sec a", "-a", "(csd - a)")
      if (targetSectionToken) {
        if (
          lowerText.includes(`section ${targetSectionToken}`) ||
          lowerText.includes(`sec ${targetSectionToken}`) ||
          lowerText.includes(`-${targetSectionToken}`) ||
          lowerText.includes(`(${targetSectionToken})`) ||
          lowerText.includes(` ${targetSectionToken} `) ||
          lowerText.includes(`-${targetSectionToken}-`) ||
          lowerText.includes(`section -${targetSectionToken}`) ||
          lowerText.includes(`- ${targetSectionToken}`) ||
          new RegExp(`\\(\\s*[A-Z]{2,4}\\s*[-–—]\\s*${targetSectionToken}\\s*\\)`, 'i').test(lowerText)
        ) {
          score += 40;
        }
      }

      // Target semester matching
      if (targetSem) {
        if (
          lowerText.includes(`sem ${targetSem}`) ||
          lowerText.includes(`semester ${targetSem}`) ||
          lowerText.includes(`sem-${targetSem}`) ||
          lowerText.includes(`${targetSem}th sem`) ||
          lowerText.includes(`${targetSem} sem`)
        ) {
          score += 20;
        }
      }

      // Bonus for having recognizable subject codes
      if (foundCodes.size > 0) {
        score += Math.min(foundCodes.size * 5, 25);
      }
    }

    if (score > highestScore && hasTextLayer) {
      highestScore = score;
      bestPageNumber = pageNum;
    }

    const meta = extractClassMetadataFromText(pageText);

    inspectedPages.push({
      pageNumber: pageNum,
      textLength,
      hasTextLayer,
      header: detectedHeader || `Page ${pageNum}`,
      snippet: snippet || (hasTextLayer ? 'Text extracted' : 'No extractable text detected'),
      detectedClassName: meta.detectedClassName,
      displayName: meta.displayName,
      detectedSemester: meta.detectedSemester,
      detectedTeacher: meta.detectedTeacher,
      detectedAcademicYear: meta.detectedAcademicYear,
      detectedDepartment: meta.detectedDepartment,
      detectedSubjectCodes: Array.from(foundCodes),
      matchScore: score,
      isRecommended: false,
    });
  }

  // Mark the best page as recommended if it scored above a minimum threshold
  if (inspectedPages.length > 0) {
    const recommended = inspectedPages.find((p) => p.pageNumber === bestPageNumber);
    if (recommended && recommended.hasTextLayer) {
      recommended.isRecommended = true;
    } else {
      // Fallback: recommend page 1 if it has a text layer
      const firstValid = inspectedPages.find((p) => p.hasTextLayer);
      if (firstValid) firstValid.isRecommended = true;
    }
  }

  const durationMs = Date.now() - startTime;
  logger.info('PDF pages inspected successfully', {
    pageCount,
    isMultiPage: pageCount > 1,
    bestPageNumber,
    durationMs,
  });

  return {
    success: true,
    data: {
      pageCount,
      isMultiPage: pageCount > 1,
      recommendedPage: bestPageNumber,
      pages: inspectedPages,
      durationMs,
    },
  };
}

/**
 * Main timetable parsing pipeline.
 * Extracts text, normalizes entities, matches against DB, and returns preview.
 * TRD Reference: FR-C1 to FR-C8
 *
 * @param {Buffer} pdfBuffer
 * @param {Object} options - { departmentId, semester, page }
 * @returns {Promise<Object>}
 */
export async function parseTimetablePdf(pdfBuffer, options = {}) {
  const startTime = Date.now();

  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    const error = new Error('Invalid PDF buffer provided.');
    error.code = 'VAL_001';
    error.statusCode = 400;
    throw error;
  }

  const selectedPage = options.page ? parseInt(options.page, 10) : null;
  if (selectedPage && (isNaN(selectedPage) || selectedPage < 1)) {
    const error = new Error('Invalid page number specified.');
    error.code = 'VAL_001';
    error.statusCode = 400;
    throw error;
  }

  // 1. Text Layer Extraction & Image-Only Rejection (FR-C1, FR-C2)
  let extractedText = '';
  let pageCount = 1;
  let parsedPage = selectedPage || 1;

  try {
    const parser = new PDFParse({ data: pdfBuffer });
    const parseParams = selectedPage ? { partial: [selectedPage] } : {};
    const textResult = await parser.getText(parseParams);

    pageCount = textResult?.total || 1;

    if (selectedPage) {
      if (selectedPage > pageCount) {
        const error = new Error(`Requested page ${selectedPage} exceeds total document pages (${pageCount}).`);
        error.code = 'VAL_001';
        error.statusCode = 400;
        throw error;
      }
      // If partial was specified, the returned pages array contains that page
      const targetedPage = textResult.pages?.find((p) => p.num === selectedPage) || textResult.pages?.[0];
      extractedText = (targetedPage?.text || '').trim();
    } else {
      // Default: if single page or no page specified
      extractedText = (textResult?.text || '').trim();
    }
  } catch (err) {
    if (err.code === 'VAL_001') throw err;
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('password') || msg.includes('encrypt') || msg.includes('security')) {
      const error = new Error('The uploaded PDF is password-protected. Please upload an unlocked PDF document.');
      error.code = 'VAL_001';
      error.statusCode = 400;
      throw error;
    }
    throw new Error(`Failed to parse PDF document: ${err.message}`);
  }

  // FR-C2: Reject image-only or scanned PDFs without text layer
  if (!extractedText || extractedText.length < 25) {
    const pageQualifier = selectedPage ? `on page ${selectedPage} of ` : 'in ';
    const error = new Error(`The uploaded PDF does not contain an extractable text layer ${pageQualifier}(appears to be a scanned image). Please upload a vector/text-searchable PDF or choose another page.`);
    error.code = 'INVALID_PDF_TEXT_LAYER';
    error.statusCode = 400;
    throw error;
  }

  // 2. Extract Raw Rows from Text (FR-C1)
  const rawRows = extractTableRowsFromText(extractedText);
  if (rawRows.length === 0) {
    const error = new Error('No subject rows could be recognized in the PDF table. Ensure the PDF includes subject codes and faculty columns.');
    error.code = 'NO_TABLE_ROWS_FOUND';
    error.statusCode = 400;
    throw error;
  }

  // Pre-fetch reference lists for efficient in-memory matching (unless supplied by caller)
  let allFaculties = options.allFaculties;
  if (!allFaculties) {
    allFaculties = await Faculty.find({ isActive: true }).select('_id name email employeeId departmentId').lean();
  }

  let allSubjects = options.allSubjects;
  if (!allSubjects) {
    allSubjects = await Subject.find({ isActive: true }).select('_id name code semester isElective').lean();
  }

  const parsedResult = parseTimetablePageFromText(extractedText, {
    pageNumber: parsedPage,
    pageCount,
    isMultiPage: pageCount > 1,
    rawRows,
    allFaculties,
    allSubjects,
    departmentId: options.departmentId || null,
  });

  const durationMs = Date.now() - startTime;
  logger.info('Timetable PDF parsed successfully', {
    totalRows: rawRows.length,
    matchedCount: parsedResult.matchedRowCount,
    flaggedCount: parsedResult.flaggedRowCount,
    selectedPage: parsedPage,
    pageCount,
    durationMs,
  });

  return {
    success: true,
    data: {
      ...parsedResult,
      durationMs,
    },
  };
}

/**
 * Pure synchronous page parser operating on already-extracted text + pre-loaded lookup arrays.
 * Enables single-pass multi-page bulk PDF parsing with zero N+1 DB queries.
 */
export function parseTimetablePageFromText(extractedText, {
  pageNumber = 1,
  pageCount = 1,
  isMultiPage = false,
  rawRows: preExtractedRows = null,
  allFaculties = [],
  allSubjects = [],
  departmentId = null,
} = {}) {
  const cleanText = String(extractedText || '').trim();
  if (!cleanText || cleanText.length < 25) {
    const error = new Error(`The uploaded PDF does not contain an extractable text layer on page ${pageNumber}.`);
    error.code = 'INVALID_PDF_TEXT_LAYER';
    error.statusCode = 400;
    throw error;
  }

  const rawRows = preExtractedRows || extractTableRowsFromText(cleanText);
  if (rawRows.length === 0) {
    const error = new Error('No subject rows could be recognized in the PDF table. Ensure the PDF includes subject codes and faculty columns.');
    error.code = 'NO_TABLE_ROWS_FOUND';
    error.statusCode = 400;
    throw error;
  }

  const subjectByCode = new Map();
  for (const s of allSubjects) {
    if (s.code) subjectByCode.set(s.code.toUpperCase().replace(/\s+/g, ''), s);
  }

  // Pre-index faculties by normalized name and token-sorted name
  const deptFacultyByNormalized = new Map();
  const deptFacultyBySortedTokens = new Map();
  const facultyByNormalizedName = new Map();
  const facultyBySortedTokens = new Map();

  for (const f of allFaculties) {
    if (!f.name) continue;
    const norm = normalizeFacultyName(f.name);
    const sorted = getTokenSortedName(f.name);
    if (norm) facultyByNormalizedName.set(norm, f);
    if (sorted) facultyBySortedTokens.set(sorted, f);

    if (departmentId && f.departmentId?.toString() === departmentId.toString()) {
      if (norm) deptFacultyByNormalized.set(norm, f);
      if (sorted) deptFacultyBySortedTokens.set(sorted, f);
    }
  }

  const lookupFacultyMatch = (name) => {
    if (!name) return null;
    const norm = normalizeFacultyName(name);
    const sorted = getTokenSortedName(name);

    // 1. Same-department match first (exact normalized then token-sorted)
    if (deptFacultyByNormalized.has(norm)) return deptFacultyByNormalized.get(norm);
    if (deptFacultyBySortedTokens.has(sorted)) return deptFacultyBySortedTokens.get(sorted);

    // 2. Global match (exact normalized then token-sorted)
    if (facultyByNormalizedName.has(norm)) return facultyByNormalizedName.get(norm);
    if (facultyBySortedTokens.has(sorted)) return facultyBySortedTokens.get(sorted);

    return null;
  };

  const processedRows = [];
  let matchedRowCount = 0;
  let flaggedRowCount = 0;

  for (const row of rawRows) {
    const { subjectCode, subjectName, facultyField, hours, isElective } = row;
    const normalizedCode = (subjectCode || '').toUpperCase().replace(/\s+/g, '');
    const matchedSubject = subjectByCode.get(normalizedCode);
    const resolvedElective = Boolean(isElective || matchedSubject?.isElective);

    // Repair stale truncated stored name if existing subject name starts with code (e.g. "23CSD4M01 Opera")
    const storedName = matchedSubject?.name?.trim() || '';
    const isStoredNameTruncated =
      storedName &&
      subjectName &&
      subjectName.toLowerCase() !== normalizedCode.toLowerCase() &&
      (storedName.toUpperCase() === normalizedCode ||
        storedName.toUpperCase().startsWith(`${normalizedCode} `));
    const cleanResolvedName =
      matchedSubject && !isStoredNameTruncated ? matchedSubject.name : subjectName;

    // FR-C3: Exclude "without teacher" subjects entirely
    if (isWithoutTeacher(facultyField)) {
      processedRows.push({
        subjectCode,
        subjectName: cleanResolvedName,
        subjectId: matchedSubject ? matchedSubject._id : null,
        facultyField,
        hours,
        isElective: resolvedElective,
        status: 'excluded',
        excludeReason: 'WITHOUT_TEACHER',
        message: 'Excluded per FR-C3: subject has no assigned teacher.',
      });
      continue;
    }

    const facultyNames = facultyField.split(/[,/&]|\band\b/i).map((n) => n.trim()).filter(Boolean);
    const primaryName = facultyNames[0] || '';
    const coNames = facultyNames.slice(1);

    const matchedPrimaryFaculty = lookupFacultyMatch(primaryName);

    const coFacultyIds = [];
    const unmatchedCoFaculty = [];
    for (const coName of coNames) {
      const matchedCo = lookupFacultyMatch(coName);
      if (matchedCo) {
        coFacultyIds.push(matchedCo._id);
      } else {
        unmatchedCoFaculty.push(coName);
      }
    }

    const isSubjectMatched = Boolean(matchedSubject);
    const isFacultyMatched = Boolean(matchedPrimaryFaculty);
    const requiresReview = !isSubjectMatched || !isFacultyMatched || unmatchedCoFaculty.length > 0;

    let rowStatus = 'matched';
    const reviewReasons = [];

    if (!isSubjectMatched) {
      rowStatus = 'flagged';
      reviewReasons.push(`Subject code "${subjectCode}" not found in database.`);
    }
    if (!isFacultyMatched) {
      rowStatus = 'flagged';
      reviewReasons.push(`Primary faculty "${primaryName}" could not be matched.`);
    }
    if (unmatchedCoFaculty.length > 0) {
      rowStatus = 'flagged';
      reviewReasons.push(`Co-faculty not matched: ${unmatchedCoFaculty.join(', ')}.`);
    }

    if (rowStatus === 'matched') {
      matchedRowCount++;
    } else {
      flaggedRowCount++;
    }

    processedRows.push({
      subjectCode,
      subjectName: cleanResolvedName,
      subjectId: matchedSubject ? matchedSubject._id : null,
      facultyName: matchedPrimaryFaculty ? matchedPrimaryFaculty.name : primaryName,
      facultyId: matchedPrimaryFaculty ? matchedPrimaryFaculty._id : null,
      coFacultyIds,
      hours,
      isElective: resolvedElective,
      status: rowStatus,
      requiresReview,
      reviewReasons,
      source: 'timetable_parse',
    });
  }

  let metadata = null;
  const textLines = cleanText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (textLines.length > 0) {
    const title = textLines[0];
    const ctMatch = cleanText.match(/Class Teacher:\s*([^\t\r\n]+)/i);
    const ayMatch = cleanText.match(/Academic Year:\s*([^\t\r\n]+)/i);
    const wefMatch = cleanText.match(/w\.e\.f\s*([^\t\r\n]+)/i);
    const deptMatch = cleanText.match(/Department of ([^\t\r\n\(\)]+)/i);
    const totalScheduledHours = rawRows.reduce((acc, r) => acc + (r.hours || 0), 0);
    const classMeta = extractClassMetadataFromText(cleanText);

    metadata = {
      classTitle: title || null,
      detectedClassName: classMeta.detectedClassName || null,
      displayName: classMeta.displayName || null,
      detectedSemester: classMeta.detectedSemester || null,
      detectedDepartment: classMeta.detectedDepartment || null,
      classTeacher: ctMatch ? ctMatch[1].trim() : classMeta.detectedTeacher || null,
      academicYear: ayMatch ? ayMatch[1].trim() : classMeta.detectedAcademicYear || null,
      wef: wefMatch ? wefMatch[1].trim() : null,
      departmentName: deptMatch ? deptMatch[1].trim() : null,
      totalScheduledHours,
    };
  }

  return {
    parsedRowCount: rawRows.length,
    matchedRowCount,
    flaggedRowCount,
    selectedPage: pageNumber,
    pageCount,
    isMultiPage,
    rows: processedRows,
    metadata,
  };
}
