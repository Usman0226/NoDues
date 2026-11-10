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

  // 1. High-precision bounded table extraction (aSc Timetables structure)
  const headerIdx = lines.findIndex(l => /Subject Name.*Faculty Name/i.test(l));
  const footerIdx = lines.findIndex(l => /Time Table Incharge|Principal|Head of the Department/i.test(l));

  if (headerIdx !== -1 && footerIdx !== -1 && footerIdx > headerIdx) {
    const tableLines = lines.slice(headerIdx + 1, footerIdx);
    const rawParsed = [];

    for (const line of tableLines) {
      const parts = line.split('\t').map(s => s.trim());
      if (parts.length < 2) continue;

      const subjectCol = parts[0];
      const facultyCol = parts[1] || 'Without teacher';
      const hoursCol = parts[2] || '0';
      const hours = parseInt(hoursCol, 10) || 0;

      let subjectCode = '';
      let subjectName = '';
      let isElective = false;

      // Extract standard code pattern (e.g. 23PHY102, 23CSD107, 23CSD4M01, 23CSD604, etc.)
      const codeMatch = subjectCol.match(/\b([0-9]{2}[A-Z]{2,4}[0-9]{2,4}[A-Z0-9]?)\b/i);
      if (codeMatch) {
        subjectCode = codeMatch[1].toUpperCase();
        subjectName = subjectCol.replace(codeMatch[0], '').replace(/^[\s\-–—:]+/, '').trim();
        if (/PE\s*[-I|IV|V0-9]|\bMOOC\b|\bElective\b/i.test(subjectCol)) {
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
      const primaryFaculty = (item.facultyField.split(',')[0] || '').trim().toLowerCase();
      const mergeKey = `${item.subjectCode}::${primaryFaculty}`;

      if (mergeMap.has(mergeKey)) {
        const existing = mergeMap.get(mergeKey);
        existing.hours += item.hours;

        // Combine co-faculty names without duplicates
        const existingFaculties = existing.facultyField.split(',').map(f => f.trim()).filter(Boolean);
        const newFaculties = item.facultyField.split(',').map(f => f.trim()).filter(Boolean);
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

  // Subject code regex pattern
  const subjectCodePattern = /\b([0-9]{2}[A-Z]{2,4}[0-9]{3,4}[A-Z]?|[A-Z]{2,5}[- ]?[0-9]{3,4}[A-Z]?)\b/gi;

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

      // Exact class name in text
      if (targetName && lowerText.includes(targetName)) {
        score += 80;
      }

      // Target section matching (e.g. "section a", "sec a", "-a")
      if (targetSectionToken) {
        if (
          lowerText.includes(`section ${targetSectionToken}`) ||
          lowerText.includes(`sec ${targetSectionToken}`) ||
          lowerText.includes(`-${targetSectionToken}`) ||
          lowerText.includes(`(${targetSectionToken})`) ||
          lowerText.includes(` ${targetSectionToken} `)
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

    inspectedPages.push({
      pageNumber: pageNum,
      textLength,
      hasTextLayer,
      header: detectedHeader || `Page ${pageNum}`,
      snippet: snippet || (hasTextLayer ? 'Text extracted' : 'No extractable text detected'),
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

  // Extract page metadata (FR-C1/FR-C7): Class, Class Teacher, Academic Year, w.e.f
  let metadata = null;
  const textLines = extractedText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (textLines.length > 0) {
    const title = textLines[0];
    const ctMatch = extractedText.match(/Class Teacher:\s*([^\t\r\n]+)/i);
    const ayMatch = extractedText.match(/Academic Year:\s*([^\t\r\n]+)/i);
    const wefMatch = extractedText.match(/w\.e\.f\s*([^\t\r\n]+)/i);
    const deptMatch = extractedText.match(/Department of ([^\t\r\n\(\)]+)/i);
    const totalScheduledHours = rawRows.reduce((acc, r) => acc + (r.hours || 0), 0);

    metadata = {
      classTitle: title || null,
      classTeacher: ctMatch ? ctMatch[1].trim() : null,
      academicYear: ayMatch ? ayMatch[1].trim() : null,
      wef: wefMatch ? wefMatch[1].trim() : null,
      departmentName: deptMatch ? deptMatch[1].trim() : null,
      totalScheduledHours,
    };
  }

  const durationMs = Date.now() - startTime;
  logger.info('Timetable PDF parsed successfully', {
    totalRows: rawRows.length,
    matchedCount: matchedRowCount,
    flaggedCount: flaggedRowCount,
    selectedPage: parsedPage,
    pageCount,
    durationMs,
  });

  return {
    success: true,
    data: {
      parsedRowCount: rawRows.length,
      matchedRowCount,
      flaggedRowCount,
      selectedPage: parsedPage,
      pageCount,
      isMultiPage: pageCount > 1,
      rows: processedRows,
      metadata,
      durationMs,
    },
  };
}
