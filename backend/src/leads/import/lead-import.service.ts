import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { LeadImportStoreService } from './lead-import-store.service';
import { ImportConfirmDto } from '../dto/import-confirm.dto';
import {
  IMPORTABLE_FIELDS,
  REQUIRED_IMPORT_FIELDS,
  type ImportableField,
} from './lead-import.constants';
import {
  isValidPhone,
  normalizePhone,
  parseSpreadsheet,
  suggestMapping,
} from './lead-import.utils';

export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate';

export interface ImportRowResult {
  rowIndex: number;
  data: Record<string, string>;
  status: ImportRowStatus;
  reason?: string;
}

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
}

const IMPORTABLE_FIELD_SET: ReadonlySet<string> = new Set(IMPORTABLE_FIELDS);

function isImportableField(value: string): value is ImportableField {
  return IMPORTABLE_FIELD_SET.has(value);
}

function toOptionalInt(value: string): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : undefined;
}

@Injectable()
export class LeadImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importStore: LeadImportStoreService,
  ) {}

  async parseUpload(file: Express.Multer.File) {
    const { headers, rows } = await parseSpreadsheet(file);

    if (headers.length === 0 || rows.length === 0) {
      throw new BadRequestException(
        'The uploaded file has no data rows to import',
      );
    }

    const importId = this.importStore.save(headers, rows);

    return {
      importId,
      headers,
      suggestedMapping: suggestMapping(headers),
      totalRows: rows.length,
      previewRows: rows.slice(0, 5),
    };
  }

  async confirmImport(dto: ImportConfirmDto): Promise<{
    summary: ImportSummary;
    rows: ImportRowResult[];
  }> {
    const record = this.importStore.get(dto.importId);
    if (!record) {
      throw new NotFoundException(
        'Import session not found or expired. Please re-upload the file.',
      );
    }

    const mappedFieldByHeader = new Map<string, ImportableField>();
    for (const [header, field] of Object.entries(dto.mapping)) {
      if (field && isImportableField(field)) {
        mappedFieldByHeader.set(header, field);
      }
    }

    const mappedFields = new Set(mappedFieldByHeader.values());
    const missingRequired = REQUIRED_IMPORT_FIELDS.filter(
      (field) => !mappedFields.has(field),
    );
    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Column mapping is missing required field(s): ${missingRequired.join(', ')}`,
      );
    }

    const existingLeads = await this.prisma.lead.findMany({
      where: { deletedAt: null },
      select: { phone: true },
    });
    const existingPhones = new Set(
      existingLeads.map((lead) => normalizePhone(lead.phone)),
    );

    const seenPhones = new Set<string>();
    const rows: ImportRowResult[] = [];
    const toInsert: Prisma.LeadCreateManyInput[] = [];

    record.rows.forEach((rawRow, rowIndex) => {
      const data: Record<string, string> = {};
      for (const [header, field] of mappedFieldByHeader) {
        data[field] = rawRow[header] ?? '';
      }

      const name = data.name ?? '';
      const phone = data.phone ?? '';

      if (!name) {
        rows.push({
          rowIndex,
          data,
          status: 'invalid',
          reason: 'Missing name',
        });
        return;
      }
      if (!phone) {
        rows.push({
          rowIndex,
          data,
          status: 'invalid',
          reason: 'Missing phone',
        });
        return;
      }
      if (!isValidPhone(phone)) {
        rows.push({
          rowIndex,
          data,
          status: 'invalid',
          reason: 'Invalid phone format',
        });
        return;
      }

      const normalizedPhone = normalizePhone(phone);
      if (
        existingPhones.has(normalizedPhone) ||
        seenPhones.has(normalizedPhone)
      ) {
        rows.push({
          rowIndex,
          data,
          status: 'duplicate',
          reason: 'Phone number already exists',
        });
        return;
      }

      seenPhones.add(normalizedPhone);
      rows.push({ rowIndex, data, status: 'valid' });
      toInsert.push({
        name,
        phone,
        alternatePhone: data.alternatePhone || undefined,
        email: data.email || undefined,
        companyName: data.companyName || undefined,
        designation: data.designation || undefined,
        industry: data.industry || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        source: data.source || 'Import',
        requirement: data.requirement || undefined,
        budget: toOptionalInt(data.budget),
        timeline: data.timeline || undefined,
        tags: data.tags
          ? data.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : [],
      });
    });

    const summary: ImportSummary = {
      totalRows: record.rows.length,
      validRows: rows.filter((row) => row.status === 'valid').length,
      invalidRows: rows.filter((row) => row.status === 'invalid').length,
      duplicateRows: rows.filter((row) => row.status === 'duplicate').length,
      importedRows: 0,
    };

    if (!dto.dryRun) {
      if (toInsert.length > 0) {
        const inserted = await this.prisma.lead.createMany({
          data: toInsert,
        });
        summary.importedRows = inserted.count;
      }
      this.importStore.delete(dto.importId);
    }

    return { summary, rows };
  }
}
