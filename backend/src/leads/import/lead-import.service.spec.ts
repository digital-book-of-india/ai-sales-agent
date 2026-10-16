import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadImportService } from './lead-import.service';
import { LeadImportStoreService } from './lead-import-store.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('LeadImportService', () => {
  let service: LeadImportService;
  let prisma: {
    lead: { findMany: jest.Mock; createMany: jest.Mock };
  };
  let importStore: {
    save: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      lead: { findMany: jest.fn(), createMany: jest.fn() },
    };
    importStore = { save: jest.fn(), get: jest.fn(), delete: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LeadImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: LeadImportStoreService, useValue: importStore },
      ],
    }).compile();

    service = moduleRef.get(LeadImportService);
  });

  describe('parseUpload', () => {
    it('stores the parsed rows and returns a suggested mapping', async () => {
      importStore.save.mockReturnValue('import-1');
      const file = {
        buffer: Buffer.from('Name,Phone\nJane Doe,9990001111\n', 'utf-8'),
        originalname: 'leads.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File;

      const result = await service.parseUpload(file);

      expect(importStore.save).toHaveBeenCalledWith(
        ['Name', 'Phone'],
        [{ Name: 'Jane Doe', Phone: '9990001111' }],
      );
      expect(result).toEqual({
        importId: 'import-1',
        headers: ['Name', 'Phone'],
        suggestedMapping: { Name: 'name', Phone: 'phone' },
        totalRows: 1,
        previewRows: [{ Name: 'Jane Doe', Phone: '9990001111' }],
      });
    });

    it('throws BadRequestException for a file with no data rows', async () => {
      const file = {
        buffer: Buffer.from('Name,Phone\n', 'utf-8'),
        originalname: 'leads.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File;

      await expect(service.parseUpload(file)).rejects.toThrow(
        BadRequestException,
      );
      expect(importStore.save).not.toHaveBeenCalled();
    });
  });

  describe('confirmImport', () => {
    const mapping = { Name: 'name', Phone: 'phone' };

    it('throws NotFoundException when the import session is missing', async () => {
      importStore.get.mockReturnValue(undefined);

      await expect(
        service.confirmImport({ importId: 'missing', mapping }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when a required field is unmapped', async () => {
      importStore.get.mockReturnValue({
        headers: ['Name'],
        rows: [{ Name: 'Jane' }],
      });

      await expect(
        service.confirmImport({
          importId: 'import-1',
          mapping: { Name: 'name' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('categorizes missing-field, invalid-phone, duplicate, and valid rows', async () => {
      importStore.get.mockReturnValue({
        headers: ['Name', 'Phone'],
        rows: [
          { Name: '', Phone: '9990001111' }, // missing name
          { Name: 'Bad Phone', Phone: '123' }, // invalid phone
          { Name: 'Existing Lead', Phone: '8880002222' }, // duplicate vs DB
          { Name: 'New Lead', Phone: '7770003333' }, // valid
          { Name: 'Repeat In File', Phone: '7770003333' }, // duplicate within batch
        ],
      });
      prisma.lead.findMany.mockResolvedValue([{ phone: '888-000-2222' }]);
      prisma.lead.createMany.mockResolvedValue({ count: 1 });

      const result = await service.confirmImport({
        importId: 'import-1',
        mapping,
        dryRun: true,
      });

      expect(result.summary).toEqual({
        totalRows: 5,
        validRows: 1,
        invalidRows: 2,
        duplicateRows: 2,
        importedRows: 0,
      });
      expect(prisma.lead.createMany).not.toHaveBeenCalled();
      expect(importStore.delete).not.toHaveBeenCalled();

      const statuses = result.rows.map((row) => row.status);
      expect(statuses).toEqual([
        'invalid',
        'invalid',
        'duplicate',
        'valid',
        'duplicate',
      ]);
    });

    it('inserts valid rows and clears the import session when not a dry run', async () => {
      importStore.get.mockReturnValue({
        headers: ['Name', 'Phone'],
        rows: [{ Name: 'New Lead', Phone: '7770003333' }],
      });
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.createMany.mockResolvedValue({ count: 1 });

      const result = await service.confirmImport({
        importId: 'import-1',
        mapping,
      });

      expect(prisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ name: 'New Lead', phone: '7770003333' }),
        ],
      });
      expect(result.summary.importedRows).toBe(1);
      expect(importStore.delete).toHaveBeenCalledWith('import-1');
    });
  });
});
