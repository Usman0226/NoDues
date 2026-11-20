import xlsx from 'xlsx';
import ErrorResponse from './errorResponse.js';

/**
 * Known Excel formula evaluation error tokens and placeholder nulls.
 */
export const EXCEL_FORMULA_ERRORS = new Set([
  '#VALUE!',
  '#REF!',
  '#N/A',
  '#DIV/0!',
  '#NAME?',
  '#NULL!',
  '#NUM!',
  '#GETTING_DATA',
  'NAN',
  'UNDEFINED',
  'NULL',
]);

/**
 * Normalizes header string by stripping zero-width characters, non-alphanumeric chars,
 * and converting to lowercase.
 */
export const normalizeHeader = (header) =>
  String(header || '')
    .toLowerCase()
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^a-z0-9]/g, '');

/**
 * Strips zero-width chars, non-breaking spaces, surrounding quotes, and extraneous whitespace.
 * Expands scientific notation if numeric float from Excel.
 * Rejects Excel formula errors (#VALUE!, #REF!, etc.).
 */
export const sanitizeValue = (val) => {
  if (val === undefined || val === null) return '';
  let str = String(val)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();

  // If value evaluates to an Excel formula error or null placeholder, return empty
  if (EXCEL_FORMULA_ERRORS.has(str.toUpperCase())) {
    return '';
  }

  // If formatted in Excel as scientific notation (e.g. 2.3691E+09), expand
  if (/^[0-9]+(\.[0-9]+)?e\+[0-9]+$/i.test(str)) {
    try {
      const num = Number(str);
      if (!isNaN(num) && isFinite(num)) {
        str = num.toFixed(0);
      }
    } catch {
      // Ignore conversion error and keep original string
    }
  }

  return str;
};

// Comprehensive institutional synonyms dictionary
export const FIELD_SYNONYMS = {
  rollNo: [
    'rollno', 'rollnumber', 'roll', 'htno', 'hallticket', 'hallticketno', 'hallticketnumber',
    'regno', 'registrationno', 'registerno', 'registeredno', 'usn', 'studentid', 'id',
    'admno', 'admissionno', 'candidaterollno', 'studentrollno', 'pin', 'pinno', 'rollnum'
  ],
  name: [
    'name', 'studentname', 'candidatename', 'nameofthecandidate', 'nameofthestudent',
    'fullname', 'student', 'candidate', 'pupilname', 'nameofcandidate', 'nameofstudent',
    'studentsname', 'candidatesname', 'facultyname', 'nameoffaculty', 'staffname', 'teachername',
    'subjectname', 'coursename'
  ],
  firstName: [
    'firstname', 'first', 'givenname', 'fname', 'first_name', 'candidatenamefirst'
  ],
  lastName: [
    'lastname', 'last', 'surname', 'lname', 'familyname', 'last_name', 'candidatenamelast'
  ],
  middleName: [
    'middlename', 'middle', 'mname', 'middle_name'
  ],
  email: [
    'email', 'emailid', 'mailid', 'emailaddress', 'institutionalemail', 'studentemail',
    'collegeemail', 'officialemail', 'facultyemail', 'mentoremail'
  ],
  employeeId: [
    'employeeid', 'empid', 'facultyid', 'staffid', 'facultyemployeeid', 'mentoremployeeid',
    'mentorid', 'facultyno', 'empno', 'teacherid', 'staffcode'
  ],
  department: [
    'department', 'dept', 'departmentname', 'branch', 'program', 'stream', 'course'
  ],
  subjectCode: [
    'subjectcode', 'coursecode', 'code', 'subcode', 'papercode', 'subjectid', 'courseid'
  ],
  semester: [
    'semester', 'sem', 'term'
  ],
  isElective: [
    'iselective', 'elective', 'electiveflag', 'type', 'subjecttype'
  ],
  phone: [
    'phone', 'phoneno', 'mobile', 'mobileno', 'contact', 'contactno'
  ],
  section: [
    'section', 'sec', 'classsection', 'sectionname'
  ],
  sno: [
    'sno', 'slno', 'serialno', 'no'
  ]
};

// Regex patterns for heuristic inference and data validation
const PATTERNS = {
  roll: /^[0-9]{2}[A-Za-z]{1,5}[0-9A-Za-z]{2,8}$/i,
  rollRange: /^[0-9]{2}[A-Za-z]{1,5}[0-9A-Za-z]{2,8}\s*[-–—~to]\s*[0-9A-Za-z]{1,8}$/i,
  email: /^\S+@\S+\.\S+$/,
  name: /^[A-Za-z\s.'-]{3,60}$/,
  summaryRow: /^(total|grand\s*total|summary|strength|count|statistics)\b/i,
  bannerRow: /transfer\s*student|lateral\s*entr|detain|nominal\s*roll|re-?admission|drop\s*out/i,
};

export const isProbablyRoll = (val) => {
  if (!val) return false;
  const s = sanitizeValue(val).replace(/\s+/g, '');
  if (PATTERNS.roll.test(s) || PATTERNS.rollRange.test(s)) return true;
  // Generic institutional roll number fallback (6-14 chars alphanumeric with letters and digits)
  if (/^[A-Za-z0-9]{6,14}$/.test(s) && /[A-Za-z]/.test(s) && /[0-9]/.test(s)) return true;
  return false;
};

export const isProbablyName = (val) => {
  if (!val) return false;
  const s = sanitizeValue(val);
  // Names do not contain numbers
  if (/[0-9]/.test(s)) return false;
  return PATTERNS.name.test(s);
};

export const isProbablyEmail = (val) => {
  if (!val) return false;
  return PATTERNS.email.test(sanitizeValue(val));
};

/**
 * Scan top rows of 2D grid to detect the table header row and map column indices.
 */
function findHeaderRow(grid) {
  let bestRowIndex = -1;
  let bestScore = 0;
  let bestFieldMap = {};

  const maxScanRows = Math.min(grid.length, 25);
  for (let r = 0; r < maxScanRows; r++) {
    const row = grid[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const filledCells = row.filter((c) => sanitizeValue(c) !== '');
    if (filledCells.length < 2) continue; // Preamble or title lines usually occupy only 1 cell

    let score = 0;
    const fieldMap = {};

    row.forEach((cell, colIndex) => {
      const norm = normalizeHeader(cell);
      if (!norm) return;

      for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
        if (synonyms.includes(norm)) {
          if (!fieldMap[field]) fieldMap[field] = [];
          fieldMap[field].push(colIndex);
          score += (field === 'rollNo' || field === 'name' || field === 'subjectCode' || field === 'employeeId' || field === 'firstName') ? 15 : 5;
          break;
        }
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = r;
      bestFieldMap = fieldMap;
    }
  }

  return { rowIndex: bestRowIndex, score: bestScore, fieldMap: bestFieldMap };
}

/**
 * Headerless heuristic: infer column mappings by inspecting cell values in data rows.
 */
function inferColumnsFromValues(grid, startRow = 0) {
  const colStats = {};
  const maxRows = Math.min(grid.length, startRow + 25);

  for (let r = startRow; r < maxRows; r++) {
    const row = grid[r];
    if (!Array.isArray(row)) continue;

    row.forEach((cell, colIndex) => {
      if (!colStats[colIndex]) {
        colStats[colIndex] = { total: 0, rollCount: 0, nameCount: 0, emailCount: 0 };
      }
      const s = sanitizeValue(cell);
      if (!s) return;
      colStats[colIndex].total++;
      if (isProbablyRoll(s)) colStats[colIndex].rollCount++;
      else if (isProbablyName(s)) colStats[colIndex].nameCount++;
      if (isProbablyEmail(s)) colStats[colIndex].emailCount++;
    });
  }

  const fieldMap = {};
  for (const [colStr, stats] of Object.entries(colStats)) {
    const col = parseInt(colStr, 10);
    if (stats.total < 2) continue;

    if (stats.emailCount / stats.total >= 0.5) {
      fieldMap.email = col;
    } else if (stats.rollCount / stats.total >= 0.5) {
      fieldMap.rollNo = col;
    } else if (stats.nameCount / stats.total >= 0.5) {
      fieldMap.name = col;
    }
  }

  return fieldMap;
}

/**
 * Cleans student or person name by standardizing spaces, removing honorifics,
 * and handling 'Lastname, Firstname' comma inversion.
 */
export const cleanPersonName = (rawName) => {
  if (!rawName) return '';
  const sanitized = sanitizeValue(rawName);
  if (!sanitized || EXCEL_FORMULA_ERRORS.has(sanitized.toUpperCase())) return '';
  let name = sanitized.replace(/\s+/g, ' ');

  // Handle 'Lastname, Firstname' format
  if (name.includes(',')) {
    const parts = name.split(',').map((p) => p.trim());
    if (parts.length === 2 && !/[0-9]/.test(parts[0]) && !/[0-9]/.test(parts[1])) {
      name = `${parts[1]} ${parts[0]}`.trim();
    } else {
      name = name.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // Strip administrative honorific prefixes for students (Mr., Ms., Sri, Kum., etc.)
  name = name.replace(/^(mr\.|ms\.|mrs\.|miss|master|sri|smt\.|kum\.|kumari)\s+/i, '');

  // Strip leading/trailing dots and non-alphabetical punctuation
  return name.replace(/^[.\s]+|[.\s]+$/g, '').trim();
};

/**
 * Checks if email is an administrative placeholder like 'NA', 'nil', '-', etc.
 */
export const isPlaceholderEmail = (email) => {
  if (!email) return true;
  const s = String(email).trim().toLowerCase();
  return (
    ['na', 'n/a', 'nil', 'null', 'none', '-', '--', 'no email', 'not available', '0', 'undefined'].includes(s) ||
    EXCEL_FORMULA_ERRORS.has(s.toUpperCase())
  );
};

/**
 * Extracts the primary valid email from cell string (handles multiple semicolon/comma separated emails).
 */
export const extractValidEmail = (val) => {
  if (!val || isPlaceholderEmail(val)) return null;
  const s = String(val).trim();
  const tokens = s.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    if (PATTERNS.email.test(token)) {
      return token.toLowerCase();
    }
  }
  return null;
};

/**
 * Parses Roman numerals or text representations of semester to a number 1-8.
 */
export const parseSemester = (val) => {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim().toUpperCase();
  const romanMap = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
  if (romanMap[s]) return romanMap[s];
  const digitMatch = s.match(/([1-8])/);
  if (digitMatch) return Number(digitMatch[1]);
  const num = Number(val);
  return !isNaN(num) && num >= 1 && num <= 8 ? num : undefined;
};

/**
 * Parses elective indicator (Yes, No, PE, OE, Elective, Core, Mandatory).
 */
export const parseElective = (val) => {
  if (val === undefined || val === null) return false;
  const s = String(val).trim().toLowerCase();
  return ['yes', 'y', 'true', '1', 'elective', 'pe', 'oe', 'professional elective', 'open elective'].includes(s);
};

/**
 * Common institutional department acronym and alias mapping.
 */
export const KNOWN_DEPT_ALIASES = {
  CSE: ['COMPUTER SCIENCE', 'COMPUTER SCIENCE AND ENGINEERING', 'COMP SCIENCE', 'CS'],
  CSD: ['COMPUTER SCIENCE AND ENGINEERING (DATA SCIENCE)', 'DATA SCIENCE', 'CSE(DS)', 'CSE-DS', 'DS'],
  CSM: ['COMPUTER SCIENCE AND ENGINEERING (AI & ML)', 'ARTIFICIAL INTELLIGENCE', 'AIML', 'CSE(AIML)', 'AI'],
  ECE: ['ELECTRONICS AND COMMUNICATION ENGINEERING', 'ELECTRONICS & COMMUNICATION', 'ELECTRONICS'],
  EEE: ['ELECTRICAL AND ELECTRONICS ENGINEERING', 'ELECTRICAL & ELECTRONICS'],
  MECH: ['MECHANICAL ENGINEERING', 'MECHANICAL', 'ME'],
  CIVIL: ['CIVIL ENGINEERING', 'CIVIL', 'CE'],
  IT: ['INFORMATION TECHNOLOGY'],
};

/**
 * Computes acronym from department name (e.g. 'Computer Science and Engineering' -> 'CSE').
 */
export const generateDepartmentAcronym = (name) => {
  if (!name) return '';
  const parenMatch = name.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1].length <= 6) {
    return parenMatch[1].trim().toUpperCase();
  }
  const stopWords = new Set(['AND', '&', 'OF', 'THE', 'IN', 'FOR']);
  const words = name.replace(/[^A-Za-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const initials = words
    .filter((w) => !stopWords.has(w.toUpperCase()))
    .map((w) => w[0].toUpperCase())
    .join('');
  return initials;
};

/**
 * Resolves a requested sheet name against workbook SheetNames, tolerating
 * trailing/leading whitespace, case differences, and punctuation normalization.
 */
export const resolveSheetKey = (workbook, requestedName) => {
  if (!workbook || !requestedName) return null;
  const sheetNames = workbook.SheetNames || [];
  if (workbook.Sheets[requestedName]) return requestedName;

  const clean = String(requestedName).trim().toLowerCase();
  const norm = normalizeHeader(requestedName);

  // 1. Trimmed case-insensitive match
  const trimmed = sheetNames.find((s) => s.trim().toLowerCase() === clean);
  if (trimmed && workbook.Sheets[trimmed]) return trimmed;

  // 2. Normalized header match
  const normalized = sheetNames.find((s) => normalizeHeader(s) === norm);
  if (normalized && workbook.Sheets[normalized]) return normalized;

  return null;
};

/**
 * Intelligent sheet selector when workbook has multiple sheets.
 * Prioritizes sheets matching target class or section (e.g. CSD-A matching DS-A),
 * and ignores non-tabular or summary sheets (e.g. STRENGTH).
 */
function selectBestSheet(workbook, targetHint = '') {
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length <= 1) return sheetNames[0] || null;

  const cleanHint = normalizeHeader(targetHint);
  let bestSheet = null;
  let bestScore = -1;

  for (const rawName of sheetNames) {
    const sheet = workbook.Sheets[rawName];
    if (!sheet) continue;

    const normName = normalizeHeader(rawName);
    const grid = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!grid || grid.length < 2) continue;

    const header = findHeaderRow(grid);
    let score = header.score;

    // Heavily penalize administrative/summary sheets so they are never picked over section sheets
    if (/detain|drop\s*out|readmission|strength|unregistered|summary|statistics|instruction/i.test(rawName)) {
      score -= 80;
    }

    if (cleanHint) {
      if (normName === cleanHint) {
        score += 100;
      } else if (normName.includes(cleanHint) || cleanHint.includes(normName)) {
        score += 50;
      } else {
        const targetSection = (targetHint.match(/[-_\s]([A-Z0-9]+)$/i) || [])[1] || '';
        const sheetSection = (rawName.match(/[-_\s]([A-Z0-9]+)\s*$/i) || [])[1] || '';
        if (targetSection && sheetSection && targetSection.toLowerCase() === sheetSection.toLowerCase()) {
          score += 40;
        }

        // Match department acronym synonyms (e.g. CSD <-> DS, CSM <-> AI)
        for (const [deptCode, aliases] of Object.entries(KNOWN_DEPT_ALIASES)) {
          const deptMatch = cleanHint.includes(deptCode.toLowerCase()) || aliases.some((a) => cleanHint.includes(normalizeHeader(a)));
          const sheetMatch = normName.includes(deptCode.toLowerCase()) || aliases.some((a) => normName.includes(normalizeHeader(a)));
          if (deptMatch && sheetMatch) {
            score += 30;
            break;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSheet = rawName;
    }
  }

  return bestSheet || sheetNames[0];
}

/**
 * Classifies a worksheet into 'roster', 'auxiliary', 'summary', or 'empty'.
 */
export function classifySheet(sheetName, grid) {
  const clean = String(sheetName || '').trim();
  if (!grid || grid.length < 2) return 'empty';

  // 1. Check administrative / summary sheet names
  if (/^(?:strength|summary|statistics|counts?)$/i.test(clean) || /strength/i.test(clean)) {
    return 'summary';
  }
  if (/^(?:detain|detained|drop\s*outs?|withdrawn|readmission|unregistered)$/i.test(clean)) {
    return 'auxiliary';
  }

  // 2. Inspect data rows in sheet
  const headerInfo = findHeaderRow(grid);
  const dataStart = headerInfo.rowIndex >= 0 ? headerInfo.rowIndex + 1 : 0;
  let studentCount = 0;

  for (let r = dataStart; r < Math.min(grid.length, dataStart + 30); r++) {
    const row = grid[r];
    if (!Array.isArray(row)) continue;
    const hasRoll = row.some((c) => isProbablyRoll(sanitizeValue(c)));
    const hasName = row.some((c) => isProbablyName(sanitizeValue(c)));
    if (hasRoll && hasName) studentCount++;
  }

  if (studentCount >= 2) {
    if (/detain|drop\s*out/i.test(clean)) return 'auxiliary';
    return 'roster';
  }

  if (studentCount === 0) {
    const hasCounts = grid.some((r) => Array.isArray(r) && r.some((c) => typeof c === 'number' || /^\d+\+\d+$/.test(String(c))));
    return hasCounts ? 'summary' : 'empty';
  }

  return 'roster';
}

/**
 * Extracts cohort metadata (section, department, semester, academicYear)
 * from sheet name, preamble rows, and filename.
 */
export function extractSheetCohortMetadata(sheetName, grid = [], filename = '') {
  let section = null;
  let department = null;
  let semester = null;
  let academicYear = null;

  const cleanSheet = String(sheetName || '').trim();
  const secMatch = cleanSheet.match(/(?:^|[-_\s])([A-Z0-9])\s*$/i);
  if (secMatch) section = secMatch[1].toUpperCase();

  const deptAcronymMatch = cleanSheet.match(/^([A-Z]{2,5})[-_\s]/i);
  if (deptAcronymMatch) {
    const rawAcronym = deptAcronymMatch[1].toUpperCase();
    for (const [code, aliases] of Object.entries(KNOWN_DEPT_ALIASES)) {
      if (code === rawAcronym || aliases.map((a) => a.toUpperCase()).includes(rawAcronym)) {
        department = code;
        break;
      }
    }
  }

  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const row = grid[r];
    if (!Array.isArray(row)) continue;
    const rowStr = row.filter((c) => c !== null && c !== undefined && c !== '').join(' ');
    if (!rowStr) continue;

    // Academic Year: '2026 - 27' or '2026-2027'
    const yrMatch = rowStr.match(/(\d{4})\s*[-–—]\s*(\d{2,4})/);
    if (yrMatch && !academicYear) {
      academicYear = yrMatch[1] + '-' + yrMatch[2].slice(-2);
    }

    // Section in preamble: 'Section -A-' or 'Section A' or 'Sec: B'
    const pSecMatch = rowStr.match(/(?:Section|Sec)[\s\-–—:]*([A-Z0-9]+)/i);
    if (pSecMatch) {
      section = pSecMatch[1].toUpperCase();
    }

    // Roman Year & Semester: 'II Year I Semester' -> Sem 3
    const romYrSem = rowStr.match(/\b(IV|III|II|I)\s*(?:Year|Yr)\s*(IV|III|II|I)\s*(?:Semester|Sem)\b/i);
    if (romYrSem) {
      const romMap = { I: 1, II: 2, III: 3, IV: 4 };
      const y = romMap[romYrSem[1].toUpperCase()];
      const s = romMap[romYrSem[2].toUpperCase()];
      if (y && s) semester = (y - 1) * 2 + s;
    }

    // Arabic Year & Semester: '2 Year 1 Semester' -> Sem 3
    const arabYrSem = rowStr.match(/\b([1-4])(?:st|nd|rd|th)?\s*(?:Year|Yr)\s*([1-2])(?:st|nd)?\s*(?:Semester|Sem)\b/i);
    if (arabYrSem && !semester) {
      const y = parseInt(arabYrSem[1], 10);
      const s = parseInt(arabYrSem[2], 10);
      semester = (y - 1) * 2 + s;
    }

    // Direct Semester: 'Semester 3'
    const directSem = rowStr.match(/\b(?:Semester|Sem)[\s\-–—:]*([1-8])\b/i);
    if (directSem && !semester) {
      semester = parseInt(directSem[1], 10);
    }

    // Department name in preamble
    if (/data\s*science/i.test(rowStr)) department = 'CSD';
    else if (/artificial\s*intelligence|ai\s*(&|and)?\s*ml/i.test(rowStr)) department = 'CSM';
    else if (/computer\s*science/i.test(rowStr) && !department) department = 'CSE';
    else if (/electronics(\s*and|\s*&)?\s*comm/i.test(rowStr)) department = 'ECE';
    else if (/electrical(\s*and|\s*&)?\s*electronics/i.test(rowStr)) department = 'EEE';
    else if (/mechanical/i.test(rowStr)) department = 'ME';
    else if (/civil/i.test(rowStr)) department = 'CE';
  }

  // Filename fallback for semester & academic year
  if ((!semester || !academicYear) && filename) {
    if (!semester) {
      const fnRom = filename.match(/\b(IV|III|II|I)\s*(?:Year|Yr)\s*(IV|III|II|I)\s*(?:Semester|Sem)\b/i);
      if (fnRom) {
        const romMap = { I: 1, II: 2, III: 3, IV: 4 };
        semester = (romMap[fnRom[1].toUpperCase()] - 1) * 2 + romMap[fnRom[2].toUpperCase()];
      }
    }
    if (!academicYear) {
      const fnYr = filename.match(/(\d{4})\s*[-–—]\s*(\d{2,4})/);
      if (fnYr) academicYear = fnYr[1] + '-' + fnYr[2].slice(-2);
    }
  }

  return { section, department, semester, academicYear };
}

/**
 * Discriminatory scoring algorithm to accurately bind a spreadsheet sheet
 * to its exact database Class model without cross-section or cross-semester contamination.
 */
export function scoreClassMatch(c, meta = {}, sheetName = '') {
  // Curriculum Master blueprints must NEVER be matched to student cohorts
  if (c.isMaster) return -999999;

  // Auxiliary or administrative summary sheets must NEVER be auto-bound to an active class
  if (/^(?:detain|detained|drop\s*outs?|withdrawn|readmission|unregistered|strength|summary|statistics|counts?)$/i.test(String(sheetName).trim())) {
    return -999999;
  }

  let score = 0;
  const cName = String(c.name || '').toUpperCase();
  const cSecMatch = cName.match(/(?:^|[-_\s])([A-Z0-9])\s*$/i);
  const cSec = cSecMatch ? cSecMatch[1].toUpperCase() : null;

  // 1. Section match: +120 on exact match, -500 if contradictory
  if (meta.section) {
    const targetSec = String(meta.section).toUpperCase();
    if (cSec === targetSec) {
      score += 120;
    } else if (cSec && cSec !== targetSec) {
      score -= 500;
    }
  }

  // 2. Semester match: +100 on exact match, -300 if contradictory
  if (meta.semester !== undefined && meta.semester !== null) {
    if (Number(c.semester) === Number(meta.semester)) {
      score += 100;
    } else {
      score -= 300;
    }
  }

  // 3. Department match: +100 if matched, -150 if completely different
  if (meta.department) {
    const deptKey = String(meta.department).toUpperCase();
    const allAliases = [deptKey, ...(KNOWN_DEPT_ALIASES[deptKey] || [])];
    const deptCode = String(c.departmentId?.code || '').toUpperCase();
    const deptName = String(c.departmentId?.name || '').toUpperCase();
    const matchesDept = allAliases.some((a) => {
      const aUpper = a.toUpperCase();
      return (
        cName.includes(aUpper) ||
        (deptCode && (deptCode === aUpper || deptCode.includes(aUpper))) ||
        (deptName && deptName.includes(aUpper))
      );
    });
    if (matchesDept) {
      score += 100;
    } else {
      score -= 150;
    }
  }

  // 4. Academic year match: +40
  if (meta.academicYear && c.academicYear) {
    const normMetaYear = String(meta.academicYear).replace(/\s+/g, '');
    const normCYear = String(c.academicYear).replace(/\s+/g, '');
    if (normMetaYear === normCYear) {
      score += 40;
    }
  }

  // 5. Normalized name match: +150 on exact, +120 on common acronym match
  const normSheet = String(sheetName || '').replace(/[\s\-_]/g, '').toUpperCase();
  const normCName = cName.replace(/[\s\-_]/g, '').toUpperCase();
  if (normSheet && normCName) {
    if (normSheet === normCName) {
      score += 150;
    } else if (
      (normSheet.startsWith('DS') && normCName.startsWith('CSD') && normSheet.slice(2) === normCName.slice(3)) ||
      (normSheet.startsWith('AI') && normCName.startsWith('CSM') && normSheet.slice(2) === normCName.slice(3))
    ) {
      score += 120;
    }
  }

  return score;
}

/**
 * Scans all worksheets in a workbook and extracts their metadata, classification,
 * and data rows for comprehensive multi-sheet ingestion.
 */
export function parseWorkbookSheets(buffer, options = {}) {
  if (!buffer?.length) return [];
  let workbook;
  try {
    const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
    const isXls = buffer.length >= 4 && buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
    if (!isZip && !isXls) {
      let text = buffer.toString('utf8').replace(/^\uFEFF/, '');
      text = text.replace(/,[ \t]+"/g, ',"').replace(/"[ \t]+,/g, '",');
      workbook = xlsx.read(Buffer.from(text), { type: 'buffer' });
    } else {
      workbook = xlsx.read(buffer, { type: 'buffer' });
    }
  } catch {
    throw new ErrorResponse(
      'Unable to read file. Please upload a valid .xlsx, .xls, or .csv spreadsheet.',
      400,
      'VAL_001'
    );
  }

  const sheetNames = workbook.SheetNames || [];
  const results = [];

  for (const sheetName of sheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const grid = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const sheetType = classifySheet(sheetName, grid);
    const meta = extractSheetCohortMetadata(sheetName, grid, options.filename || '');

    let rows = [];
    if (sheetType === 'roster' || sheetType === 'auxiliary') {
      try {
        rows = parseBuffer(buffer, { preferredSheet: sheetName, type: options.type || 'students' });
      } catch {
        rows = [];
      }
    }

    results.push({
      sheetName: sheetName.trim(),
      originalSheetName: sheetName,
      sheetType,
      meta,
      rows,
      rowCount: rows.length
    });
  }

  return results;
}

/**
 * Parses spreadsheet buffer (XLSX, XLS, or CSV) with industry-grade resilience.
 * - Handles arbitrary leading preamble/title rows.
 * - Auto-detects table header row and tolerates punctuation/case/formatting variations.
 * - Supports split name columns (First Name, Last Name, Surname).
 * - Discards trailing commas, blank rows, and summary footer rows.
 * - Selects appropriate sheet when multi-sheet workbook is uploaded.
 * - Performs value-based heuristic column swapping for inverted columns.
 * - Attaches availableSheets and sheetName metadata to the returned array.
 */
export const parseBuffer = (buffer, options = {}) => {
  if (!buffer?.length) return [];

  let workbook;
  try {
    const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
    const isXls = buffer.length >= 4 && buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;

    if (!isZip && !isXls) {
      let text = buffer.toString('utf8').replace(/^\uFEFF/, '');
      text = text.replace(/,[ \t]+"/g, ',"').replace(/"[ \t]+,/g, '",');
      workbook = xlsx.read(Buffer.from(text), { type: 'buffer' });
    } else {
      workbook = xlsx.read(buffer, { type: 'buffer' });
    }
  } catch {
    throw new ErrorResponse(
      'Unable to read file. Please upload a valid .xlsx, .xls, or .csv spreadsheet.',
      400,
      'VAL_001'
    );
  }

  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) return [];

  // Determine available tabular data sheets
  const availableSheets = [];
  for (const sName of sheetNames) {
    const s = workbook.Sheets[sName];
    if (!s) continue;
    const g = xlsx.utils.sheet_to_json(s, { header: 1, defval: '' });
    if (g && g.length >= 2) {
      const h = findHeaderRow(g);
      if (h.score >= 10 || inferColumnsFromValues(g, 0).rollNo !== undefined) {
        availableSheets.push(sName.trim());
      }
    }
  }

  const sheetKey =
    resolveSheetKey(workbook, options.preferredSheet) ||
    selectBestSheet(workbook, options.targetHint);
  if (!sheetKey) return [];

  const sheet = workbook.Sheets[sheetKey];
  if (!sheet) return [];

  const grid = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!grid || grid.length === 0) return [];

  const headerInfo = findHeaderRow(grid);
  let fieldMap = headerInfo.fieldMap;
  let dataStartRow = headerInfo.rowIndex >= 0 ? headerInfo.rowIndex + 1 : 0;

  // Headerless fallback
  if (headerInfo.score < 10) {
    fieldMap = inferColumnsFromValues(grid, 0);
    dataStartRow = 0;
  }

  const rawHeaders = headerInfo.rowIndex >= 0 ? grid[headerInfo.rowIndex] : [];
  const rows = [];

  for (let r = dataStartRow; r < grid.length; r++) {
    const rawRow = grid[r];
    if (!Array.isArray(rawRow)) continue;

    // Check if completely empty
    const filledCells = rawRow.filter((c) => sanitizeValue(c) !== '');
    if (filledCells.length === 0) continue;

    // Check if it's a preamble or title row (single text cell with no roll/name)
    if (filledCells.length === 1) {
      const singleVal = sanitizeValue(filledCells[0]);
      if (!isProbablyRoll(singleVal) && !isProbablyName(singleVal)) continue;
    }

    // Check if it's a summary/footer row
    const firstCell = sanitizeValue(rawRow[0] || rawRow[1] || '');
    if (PATTERNS.summaryRow.test(firstCell)) continue;

    // Check if it's a repeated header row (e.g. concatenated sections)
    const isRepeatedHeader = rawRow.some((cell) => {
      const norm = normalizeHeader(cell);
      return FIELD_SYNONYMS.rollNo.includes(norm) || FIELD_SYNONYMS.name.includes(norm);
    });
    if (isRepeatedHeader) continue;

    // Build row object
    const rowObj = {};

    // 1. Populate original headers
    rawRow.forEach((cell, colIdx) => {
      const headerKey = rawHeaders[colIdx] ? sanitizeValue(rawHeaders[colIdx]) : `col_${colIdx}`;
      rowObj[headerKey] = sanitizeValue(cell);
    });

    // Helper to extract first non-empty value across synonymous mapped column indices
    const getFieldVal = (mapEntry) => {
      if (mapEntry === undefined || mapEntry === null) return '';
      if (Array.isArray(mapEntry)) {
        for (const colIdx of mapEntry) {
          const v = sanitizeValue(rawRow[colIdx]);
          if (v) return v;
        }
        return '';
      }
      return sanitizeValue(rawRow[mapEntry]);
    };

    // 2. Populate canonical fields from fieldMap
    if (fieldMap.rollNo !== undefined) rowObj.rollNo = getFieldVal(fieldMap.rollNo);
    if (fieldMap.name !== undefined) rowObj.name = getFieldVal(fieldMap.name);
    if (fieldMap.firstName !== undefined) rowObj.firstName = getFieldVal(fieldMap.firstName);
    if (fieldMap.lastName !== undefined) rowObj.lastName = getFieldVal(fieldMap.lastName);
    if (fieldMap.middleName !== undefined) rowObj.middleName = getFieldVal(fieldMap.middleName);
    if (fieldMap.email !== undefined) rowObj.email = getFieldVal(fieldMap.email);
    if (fieldMap.employeeId !== undefined) rowObj.employeeId = getFieldVal(fieldMap.employeeId);
    if (fieldMap.subjectCode !== undefined) rowObj.subjectCode = getFieldVal(fieldMap.subjectCode);
    if (fieldMap.department !== undefined) rowObj.department = getFieldVal(fieldMap.department);
    if (fieldMap.semester !== undefined) rowObj.semester = getFieldVal(fieldMap.semester);
    if (fieldMap.isElective !== undefined) rowObj.isElective = getFieldVal(fieldMap.isElective);
    if (fieldMap.phone !== undefined) rowObj.phone = getFieldVal(fieldMap.phone);
    if (fieldMap.section !== undefined) rowObj.section = getFieldVal(fieldMap.section);

    // Handle split name columns (First Name + Last Name)
    if (!rowObj.name && (rowObj.firstName || rowObj.lastName)) {
      rowObj.name = [rowObj.firstName, rowObj.middleName, rowObj.lastName].filter(Boolean).join(' ').trim();
    }

    // 3. Value-based auto-correction (Heuristic column swapping)
    // Case A: rollNo looks like a Name and name looks like a Roll Number
    if (rowObj.rollNo && rowObj.name) {
      if (isProbablyName(rowObj.rollNo) && isProbablyRoll(rowObj.name)) {
        const temp = rowObj.rollNo;
        rowObj.rollNo = rowObj.name;
        rowObj.name = temp;
      }
    }

    // Case B: name looks like Email and email looks like Name
    if (rowObj.name && rowObj.email) {
      if (isProbablyEmail(rowObj.name) && !isProbablyEmail(rowObj.email)) {
        const temp = rowObj.name;
        rowObj.name = rowObj.email;
        rowObj.email = temp;
      }
    }

    // Clean name
    if (rowObj.name) {
      rowObj.name = cleanPersonName(rowObj.name);
    }

    // Clean roll number (remove internal whitespace e.g. 25MRA 07001 -> 25MRA07001)
    if (rowObj.rollNo) {
      rowObj.rollNo = rowObj.rollNo.replace(/\s+/g, '').toUpperCase();
    }

    // Clean email (filter out placeholders like 'NA', 'nil', '-')
    if (rowObj.email) {
      const extracted = extractValidEmail(rowObj.email);
      rowObj.email = extracted || '';
    }

    // Sub-section banner row filter (e.g. "Transfer Students")
    const lowerName = (rowObj.name || '').toLowerCase();
    const lowerRoll = (rowObj.rollNo || '').toLowerCase();
    const lowerFirst = firstCell.toLowerCase();
    const isBanner = [lowerName, lowerRoll, lowerFirst].some((txt) => PATTERNS.bannerRow.test(txt));
    if (isBanner && (!rowObj.rollNo || !rowObj.name)) {
      continue;
    }

    // Skip rows where both rollNo and name are completely empty
    if (!rowObj.rollNo && !rowObj.name && !rowObj.employeeId && !rowObj.subjectCode) {
      continue;
    }

    // Canonical aliases for backward compatibility with getRowValue
    if (rowObj.rollNo) rowObj['Roll No'] = rowObj.rollNo;
    if (rowObj.name) rowObj['Name'] = rowObj.name;
    if (rowObj.email) rowObj['Email'] = rowObj.email;
    if (rowObj.employeeId) rowObj['Employee ID'] = rowObj.employeeId;
    if (rowObj.subjectCode) rowObj['Code'] = rowObj.subjectCode;
    if (rowObj.department) rowObj['Department'] = rowObj.department;

    rows.push(rowObj);
  }

  // Attach metadata properties to the array
  rows.sheetName = sheetKey.trim();
  rows.availableSheets = availableSheets.length > 0 ? availableSheets : [sheetKey.trim()];

  return rows;
};

/**
 * Retrieves a row value with prioritized matching:
 * 1. Pre-computed canonical properties.
 * 2. Exact key lookup.
 * 3. Case-insensitive and punctuation-insensitive header matching.
 */
export const getRowValue = (row, keys) => {
  if (!row || typeof row !== 'object') return null;

  const normalizedKeys = keys.map(normalizeHeader).filter(Boolean);

  // 1. Check canonical fields if keys match standard concepts
  if (normalizedKeys.some((k) => ['rollno', 'roll', 'htno', 'regno', 'usn'].includes(k))) {
    if (row.rollNo) return sanitizeValue(row.rollNo);
  }
  if (normalizedKeys.some((k) => ['name', 'studentname', 'candidatename', 'nameofthecandidate'].includes(k))) {
    if (row.name) return sanitizeValue(row.name);
  }
  if (normalizedKeys.some((k) => ['email', 'emailid', 'mailid'].includes(k))) {
    if (row.email) return sanitizeValue(row.email);
  }
  if (normalizedKeys.some((k) => ['employeeid', 'empid', 'facultyid'].includes(k))) {
    if (row.employeeId) return sanitizeValue(row.employeeId);
  }
  if (normalizedKeys.some((k) => ['subjectcode', 'coursecode', 'code'].includes(k))) {
    if (row.subjectCode || row.code) return sanitizeValue(row.subjectCode || row.code);
  }
  if (normalizedKeys.some((k) => ['department', 'dept'].includes(k))) {
    if (row.department) return sanitizeValue(row.department);
  }

  // 2. Fast exact key match
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      const sanitized = sanitizeValue(row[key]);
      if (sanitized !== '') return sanitized;
    }
  }

  // 3. Normalized header match
  for (const [header, val] of Object.entries(row)) {
    if (val === undefined || val === null) continue;
    if (normalizedKeys.includes(normalizeHeader(header))) {
      const sanitized = sanitizeValue(val);
      if (sanitized !== '') return sanitized;
    }
  }

  return null;
};
