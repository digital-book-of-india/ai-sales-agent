import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import {
  FIELD_ALIASES,
  IMPORTABLE_FIELDS,
  type ImportableField,
} from './lead-import.constants';

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function suggestMapping(
  headers: string[],
): Record<string, ImportableField | null> {
  const mapping: Record<string, ImportableField | null> = {};
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    mapping[header] =
      IMPORTABLE_FIELDS.find((field) =>
        FIELD_ALIASES[field].includes(normalized),
      ) ?? null;
  }
  return mapping;
}

function rowsFromTable(table: string[][]): {
  headers: string[];
  rows: Record<string, string>[];
} {
  if (table.length === 0) return { headers: [], rows: [] };

  const headers = table[0].map((cell) => (cell ?? '').toString().trim());
  const rows = table
    .slice(1)
    .filter((row) => row.some((cell) => (cell ?? '').toString().trim() !== ''))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = (row[index] ?? '').toString().trim();
      });
      return record;
    });

  return { headers, rows };
}

function parseCsv(buffer: Buffer): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const text = buffer.toString('utf-8');
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return rowsFromTable(result.data);
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number' || typeof cell === 'boolean')
    return String(cell);
  if (typeof cell === 'object') {
    const obj = cell as { text?: unknown; result?: unknown };
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.result === 'string' || typeof obj.result === 'number') {
      return String(obj.result);
    }
  }
  return '';
}

async function parseXlsx(buffer: Buffer): Promise<{
  headers: string[];
  rows: Record<string, string>[];
}> {
  const workbook = new ExcelJS.Workbook();
  // exceljs ships an ambient `Buffer extends ArrayBuffer` declaration that
  // conflicts with @types/node's real Buffer, so the parameter type here
  // can never structurally match a real Buffer — cast through `any`.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };

  const table: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    table.push(values.slice(1).map(cellToString));
  });

  return rowsFromTable(table);
}

export function parseSpreadsheet(file: {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const isXlsx =
    /\.xlsx$/i.test(file.originalname) ||
    file.mimetype.includes('spreadsheetml');

  return isXlsx
    ? parseXlsx(file.buffer)
    : Promise.resolve(parseCsv(file.buffer));
}

const PHONE_REGEX = /^\+?[\d\s\-().]{7,20}$/;

export function isValidPhone(phone: string): boolean {
  if (!PHONE_REGEX.test(phone)) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function toCsv(
  rows: Record<string, string | number | null | undefined>[],
  columns: { key: string; label: string }[],
): string {
  const escape = (value: string | number | null | undefined): string => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [columns.map((col) => escape(col.label)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => escape(row[col.key])).join(','));
  }
  return lines.join('\n');
}
