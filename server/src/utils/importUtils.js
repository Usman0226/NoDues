import xlsx from 'xlsx';
import ErrorResponse from './errorResponse.js';

const normalizeHeader = (header) =>
  String(header || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const parseBuffer = (buffer) => {
  if (!buffer?.length) return [];

  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'buffer' });
  } catch {
    throw new ErrorResponse(
      'Unable to read file. Please upload a valid .xlsx, .xls, or .csv spreadsheet.',
      400,
      'VAL_001'
    );
  }

  const sheetName = workbook?.SheetNames?.[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  // Drop completely empty trailing/blank spreadsheet rows
  return rawRows.filter((row) =>
    Object.values(row).some((val) => val !== undefined && val !== null && String(val).trim() !== '')
  );
};

export const getRowValue = (row, keys) => {
  if (!row || typeof row !== 'object') return null;

  // Fast exact key match
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      const trimmed = row[key].toString().trim();
      if (trimmed !== '') return trimmed;
    }
  }

  // Case-insensitive and punctuation-insensitive fallback match
  const normalizedTargetKeys = keys.map(normalizeHeader).filter(Boolean);
  for (const [header, val] of Object.entries(row)) {
    if (val === undefined || val === null) continue;
    if (normalizedTargetKeys.includes(normalizeHeader(header))) {
      const trimmed = val.toString().trim();
      if (trimmed !== '') return trimmed;
    }
  }

  return null;
};