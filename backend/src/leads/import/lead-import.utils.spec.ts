import ExcelJS from 'exceljs';
import {
  isValidPhone,
  normalizeHeader,
  normalizePhone,
  parseSpreadsheet,
  suggestMapping,
  toCsv,
} from './lead-import.utils';

describe('normalizeHeader', () => {
  it('lowercases and strips non-alphanumeric characters', () => {
    expect(normalizeHeader(' Phone Number ')).toBe('phonenumber');
    expect(normalizeHeader('Company_Name')).toBe('companyname');
  });
});

describe('suggestMapping', () => {
  it('matches known aliases to their target field', () => {
    const mapping = suggestMapping([
      'Full Name',
      'Mobile Number',
      'Company',
      'Unknown Column',
    ]);

    expect(mapping['Full Name']).toBe('name');
    expect(mapping['Mobile Number']).toBe('phone');
    expect(mapping['Company']).toBe('companyName');
    expect(mapping['Unknown Column']).toBeNull();
  });
});

describe('isValidPhone', () => {
  it('accepts phone numbers with 7-15 digits', () => {
    expect(isValidPhone('9990001111')).toBe(true);
    expect(isValidPhone('+91 999-000-1111')).toBe(true);
  });

  it('rejects too-short or non-numeric values', () => {
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('not-a-phone')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});

describe('normalizePhone', () => {
  it('strips non-digit characters', () => {
    expect(normalizePhone('+91 999-000-1111')).toBe('919990001111');
  });
});

describe('toCsv', () => {
  it('escapes commas, quotes, and newlines', () => {
    const csv = toCsv(
      [{ name: 'Jane, "The Boss"', note: 'line1\nline2' }],
      [
        { key: 'name', label: 'Name' },
        { key: 'note', label: 'Note' },
      ],
    );

    expect(csv).toBe('Name,Note\n"Jane, ""The Boss""","line1\nline2"');
  });
});

describe('parseSpreadsheet', () => {
  it('parses a CSV buffer into headers and row objects', async () => {
    const csv = 'Name,Phone\nJane Doe,9990001111\nJohn Smith,8880002222\n';
    const file = {
      buffer: Buffer.from(csv, 'utf-8'),
      originalname: 'leads.csv',
      mimetype: 'text/csv',
    };

    const { headers, rows } = await parseSpreadsheet(file);

    expect(headers).toEqual(['Name', 'Phone']);
    expect(rows).toEqual([
      { Name: 'Jane Doe', Phone: '9990001111' },
      { Name: 'John Smith', Phone: '8880002222' },
    ]);
  });

  it('parses an XLSX buffer into headers and row objects', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');
    sheet.addRow(['Name', 'Phone']);
    sheet.addRow(['Jane Doe', '9990001111']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const file = {
      buffer,
      originalname: 'leads.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    const { headers, rows } = await parseSpreadsheet(file);

    expect(headers).toEqual(['Name', 'Phone']);
    expect(rows).toEqual([{ Name: 'Jane Doe', Phone: '9990001111' }]);
  });
});
