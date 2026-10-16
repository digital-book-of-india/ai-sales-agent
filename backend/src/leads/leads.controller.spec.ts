import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadImportService } from './import/lead-import.service';
import { ManualCallService } from '../calling/manual-call.service';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

describe('LeadsController', () => {
  let controller: LeadsController;
  let leadsService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    bulkAssign: jest.Mock;
    addNote: jest.Mock;
    addTag: jest.Mock;
    export: jest.Mock;
    getActivity: jest.Mock;
  };
  let leadImportService: {
    parseUpload: jest.Mock;
    confirmImport: jest.Mock;
  };
  let manualCallService: { initiateCall: jest.Mock };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: Role.SALES_MANAGER,
  };

  beforeEach(async () => {
    leadsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      bulkAssign: jest.fn(),
      addNote: jest.fn(),
      addTag: jest.fn(),
      export: jest.fn(),
      getActivity: jest.fn(),
    };
    leadImportService = {
      parseUpload: jest.fn(),
      confirmImport: jest.fn(),
    };
    manualCallService = { initiateCall: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [LeadsController],
      providers: [
        { provide: LeadsService, useValue: leadsService },
        { provide: LeadImportService, useValue: leadImportService },
        { provide: ManualCallService, useValue: manualCallService },
      ],
    }).compile();

    controller = moduleRef.get(LeadsController);
  });

  it('delegates findAll to the service with the current user', () => {
    leadsService.findAll.mockResolvedValue({ data: [], total: 0 });

    void controller.findAll(user, {});

    expect(leadsService.findAll).toHaveBeenCalledWith(user, {});
  });

  it('delegates create to the service with the current user', () => {
    const dto = { name: 'Jane', phone: '123' };

    void controller.create(user, dto);

    expect(leadsService.create).toHaveBeenCalledWith(user, dto);
  });

  it('delegates bulkAssign to the service without a scoped user', () => {
    const dto = { leadIds: ['lead-1'], assignedToId: 'exec-1' };

    void controller.bulkAssign(dto);

    expect(leadsService.bulkAssign).toHaveBeenCalledWith(dto);
  });

  it('delegates addNote to the service with the current user', () => {
    const dto = { body: 'called, no answer' };

    void controller.addNote(user, 'lead-1', dto);

    expect(leadsService.addNote).toHaveBeenCalledWith(user, 'lead-1', dto);
  });

  it('delegates addTag to the service with the current user', () => {
    const dto = { tag: 'vip' };

    void controller.addTag(user, 'lead-1', dto);

    expect(leadsService.addTag).toHaveBeenCalledWith(user, 'lead-1', dto);
  });

  it('delegates importFile to the import service', () => {
    const file = { originalname: 'leads.csv' } as Express.Multer.File;
    leadImportService.parseUpload.mockResolvedValue({ importId: 'import-1' });

    void controller.importFile(file);

    expect(leadImportService.parseUpload).toHaveBeenCalledWith(file);
  });

  it('throws BadRequestException when importFile receives no file', () => {
    expect(() =>
      controller.importFile(undefined as unknown as Express.Multer.File),
    ).toThrow(BadRequestException);
    expect(leadImportService.parseUpload).not.toHaveBeenCalled();
  });

  it('delegates initiateCall to ManualCallService with the current user', () => {
    manualCallService.initiateCall.mockResolvedValue({
      callId: 'call-1',
      queueItemId: 'queue-1',
      campaignId: 'manual-campaign-1',
    });

    void controller.initiateCall(user, 'lead-1');

    expect(manualCallService.initiateCall).toHaveBeenCalledWith(user, 'lead-1');
  });

  it('delegates getActivity to the service with the current user', () => {
    void controller.getActivity(user, 'lead-1');

    expect(leadsService.getActivity).toHaveBeenCalledWith(user, 'lead-1');
  });

  it('delegates importConfirm to the import service', () => {
    const dto = { importId: 'import-1', mapping: { Name: 'name' } };

    void controller.importConfirm(dto);

    expect(leadImportService.confirmImport).toHaveBeenCalledWith(dto);
  });

  it('streams a CSV response from exportLeads', async () => {
    leadsService.export.mockResolvedValue('Name,Phone\nJane,123');
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await controller.exportLeads(user, {}, res as never);

    expect(leadsService.export).toHaveBeenCalledWith(user, {});
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(res.send).toHaveBeenCalledWith('Name,Phone\nJane,123');
  });
});
