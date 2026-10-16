import { Test } from '@nestjs/testing';
import { ActivityService } from './activity.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivityService', () => {
  let service: ActivityService;
  let prisma: { activity: { create: jest.Mock; findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { activity: { create: jest.fn(), findMany: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(ActivityService);
  });

  describe('record', () => {
    it('creates an activity row, defaulting payload to {} and actor to system', async () => {
      await service.record({
        leadId: 'lead-1',
        callId: 'call-1',
        type: 'CALL_COMPLETED',
      });

      expect(prisma.activity.create).toHaveBeenCalledWith({
        data: {
          leadId: 'lead-1',
          callId: 'call-1',
          type: 'CALL_COMPLETED',
          payload: {},
          actorUserId: undefined,
        },
      });
    });

    it('passes through a payload and actor when given', async () => {
      await service.record({
        leadId: 'lead-1',
        type: 'NOTE_ADDED',
        payload: { body: 'hello' },
        actorUserId: 'user-1',
      });

      expect(prisma.activity.create).toHaveBeenCalledWith({
        data: {
          leadId: 'lead-1',
          callId: undefined,
          type: 'NOTE_ADDED',
          payload: { body: 'hello' },
          actorUserId: 'user-1',
        },
      });
    });
  });

  describe('listForLead', () => {
    it('lists newest first with the actor name included', async () => {
      await service.listForLead('lead-1');

      expect(prisma.activity.findMany).toHaveBeenCalledWith({
        where: { leadId: 'lead-1' },
        orderBy: { createdAt: 'desc' },
        include: { actorUser: { select: { id: true, name: true } } },
      });
    });
  });
});
