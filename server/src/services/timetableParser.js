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
    .replace(/\b(dr|prof|professor|mr|mrs|ms|er)\b\.?/gi, '') // strip honorifics
    .replace(/[^\w\s]/g, '') // remove punctuation/dots
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Checks if faculty name represents an unassigned course ("without teacher").
 * TRD Reference: FR-C3
 *
 * @param {string} facultyName
 * @returns {boolean}
 */
export function isWithoutTeacher(facultyName) {
  if (!facultyName) return true;
  const normalized = facultyName.toLowerCase().replace(/[^a-z]/g, '');
  return normalized === 'withoutteacher' || normalized === 'noteacher';
}

/**
 * Parses raw text lines to detect subject summary table rows.
 * Extracts: subjectCode, subjectName, facultyName, hours.
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

  const parsedRows = [];

  // Regex patterns to identify subject code (e.g., 20CS401, CS301, 23CSE-402, etc.)
  const subjectCodePattern = /\b([0-9]{2}[A-Z]{2,4}[0-9]{3,4}[A-Z]?|[A-Z]{2,5}[- ]?[0-9]{3,4}[A-Z]?)\b/i;

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

    // Look for hours at the end (integer between 1 and 60)
    let hours = null;
    let nameAndFaculty = lineWithoutCode;
    const hoursMatch = lineWithoutCode.match(/\b([1-9][0-9]?)\s*$/);
    if (hoursMatch) {
      hours = parseInt(hoursMatch[1], 10);
      nameAndFaculty = lineWithoutCode.slice(0, hoursMatch.index).trim();
    }

    // Attempt to split subject name and faculty name
    // Common delimiters: ' - ', ' / ', ' by ', or tab/multiple spaces
    let subjectName = '';
    let facultyField = '';

    const delimiterMatch = nameAndFaculty.match(/\s+[-–—/]\s+|\t+|\s{3,}/);
    if (delimiterMatch) {
      const parts = nameAndFaculty.split(delimiterMatch[0]);
      subjectName = parts[0].trim();
      facultyField = parts.slice(1).join(' ').trim();
    } else {
      // Fallback: search for honorific boundary
      const honorificMatch = nameAndFaculty.match(/\b(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.|Er\.)\b/i);
      if (honorificMatch && honorificMatch.index > 3) {
        subjectName = nameAndFaculty.slice(0, honorificMatch.index).trim();
        facultyField = nameAndFaculty.slice(honorificMatch.index).trim();
      } else {
        // Half split heuristic
        subjectName = nameAndFaculty;
        facultyField = '';
      }
    }

    if (subjectCode && (subjectName || facultyField)) {
      parsedRows.push({
        rawLine: line,
        subjectCode,
        subjectName: subjectName || subjectCode,
        facultyField: facultyField || 'Without Teacher',
        hours: hours || 0,
      });
    }
  }

  return parsedRows;
}

/**
 * Main timetable parsing pipeline.
 * Extracts text, normalizes entities, matches against DB, and returns preview.
 * TRD Reference: FR-C1 to FR-C8
 *
 * @param {Buffer} pdfBuffer
 * @param {Object} options - { departmentId, semester }
 * @returns {Promise<Object>}
 */
export async function parseTimetablePdf(pdfBuffer, options = {}) {
  const startTime = Date.now();

  // 1. Text Layer Extraction & Image-Only Rejection (FR-C1, FR-C2)
  let extractedText = '';
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    const textResult = await parser.getText();
    extractedText = (textResult?.text || '').trim();
  } catch (err) {
    throw new Error(`Failed to parse PDF document: ${err.message}`);
  }

  // FR-C2: Reject image-only or scanned PDFs without text layer
  if (!extractedText || extractedText.length < 40) {
    const error = new Error('The uploaded PDF does not contain an extractable text layer (appears to be a scanned image). Please upload a vector/text-searchable PDF.');
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

  // Pre-fetch reference lists for efficient in-memory matching
  const facultyQuery = options.departmentId ? { departmentId: options.departmentId, isActive: true } : { isActive: true };
  const allFaculties = await Faculty.find(facultyQuery).select('_id name email employeeId departmentId').lean();

  const subjectQuery = options.departmentId ? { departmentId: options.departmentId, isActive: true } : { isActive: true };
  const allSubjects = await Subject.find(subjectQuery).select('_id name code semester isElective').lean();

  // Build index lookups
  const subjectByCode = new Map();
  for (const s of allSubjects) {
    if (s.code) subjectByCode.set(s.code.toUpperCase().replace(/\s+/g, ''), s);
  }

  // Faculty normalized name map
  const facultyByNormalizedName = new Map();
  for (const f of allFaculties) {
    if (f.name) {
      facultyByNormalizedName.set(normalizeFacultyName(f.name), f);
    }
  }

  const processedRows = [];
  let matchedRowCount = 0;
  let flaggedRowCount = 0;

  for (const row of rawRows) {
    const { subjectCode, subjectName, facultyField, hours } = row;

    // FR-C3: Exclude "without teacher" subjects entirely
    if (isWithoutTeacher(facultyField)) {
      processedRows.push({
        subjectCode,
        subjectName,
        facultyField,
        hours,
        status: 'excluded',
        excludeReason: 'WITHOUT_TEACHER',
        message: 'Excluded per FR-C3: subject has no assigned teacher.',
      });
      continue;
    }

    // FR-C4: Handle multiple faculty names (comma-separated)
    // First name is primary approving faculty; remaining are coFaculty
    const facultyNames = facultyField.split(',').map(n => n.trim()).filter(Boolean);
    const primaryName = facultyNames[0] || '';
    const coNames = facultyNames.slice(1);

    // FR-C5: Normalize names and match against database
    const normalizedPrimary = normalizeFacultyName(primaryName);
    const matchedPrimaryFaculty = facultyByNormalizedName.get(normalizedPrimary);

    const coFacultyIds = [];
    const unmatchedCoFaculty = [];
    for (const coName of coNames) {
      const matchedCo = facultyByNormalizedName.get(normalizeFacultyName(coName));
      if (matchedCo) {
        coFacultyIds.push(matchedCo._id);
      } else {
        unmatchedCoFaculty.push(coName);
      }
    }

    // FR-C6: Match Subject by exact subjectCode
    const matchedSubject = subjectByCode.get(subjectCode.toUpperCase().replace(/\s+/g, ''));

    // FR-C8: Flag row for manual review if subject or faculty cannot be matched
    const isSubjectMatched = Boolean(matchedSubject);
    const isFacultyMatched = Boolean(matchedPrimaryFaculty);
    const requiresReview = !isSubjectMatched || !isFacultyMatched || unmatchedCoFaculty.length > 0;

    let rowStatus = 'matched';
    let reviewReasons = [];

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
      subjectName: matchedSubject ? matchedSubject.name : subjectName,
      subjectId: matchedSubject ? matchedSubject._id : null,
      facultyName: matchedPrimaryFaculty ? matchedPrimaryFaculty.name : primaryName,
      facultyId: matchedPrimaryFaculty ? matchedPrimaryFaculty._id : null,
      coFacultyIds,
      hours,
      status: rowStatus,
      requiresReview,
      reviewReasons,
      source: 'timetable_parse',
    });
  }

  const durationMs = Date.now() - startTime;
  logger.info('Timetable PDF parsed successfully', {
    totalRows: rawRows.length,
    matchedCount: matchedRowCount,
    flaggedCount: flaggedRowCount,
    durationMs,
  });

  return {
    success: true,
    data: {
      parsedRowCount: rawRows.length,
      matchedRowCount,
      flaggedRowCount,
      rows: processedRows,
      durationMs,
    },
  };
}
