import { Test } from '@nestjs/testing';
import { HumanTransferController } from './human-transfer.controller';
import { HumanTransferService } from './human-transfer.service';
import { IntentDetectionService } from '../ai-voice/intent-detection.service';
import type { SimulateHumanTransferDto } from './dto/simulate-human-transfer.dto';

describe('HumanTransferController', () => {
  let controller: HumanTransferController;
  let humanTransferService: { evaluateAndTransfer: jest.Mock };
  let intentService: { detect: jest.Mock };

  beforeEach(async () => {
    humanTransferService = { evaluateAndTransfer: jest.fn() };
    intentService = { detect: jest.fn().mockReturnValue('other') };

    const moduleRef = await Test.createTestingModule({
      controllers: [HumanTransferController],
      providers: [
        { provide: HumanTransferService, useValue: humanTransferService },
        { provide: IntentDetectionService, useValue: intentService },
      ],
    }).compile();

    controller = moduleRef.get(HumanTransferController);
  });

  it('auto-detects intent and applies defaults when the caller omits them', () => {
    const dto: SimulateHumanTransferDto = {
      customerUtterance: 'talk to a person',
    };

    void controller.simulate('call-1', dto);

    expect(intentService.detect).toHaveBeenCalledWith('talk to a person');
    expect(humanTransferService.evaluateAndTransfer).toHaveBeenCalledWith(
      'call-1',
      {
        customerUtterance: 'talk to a person',
        detectedIntent: 'other',
        groundedInKnowledgeBase: true,
        confidence: 1,
        llmRequestedTransfer: false,
      },
    );
  });

  it('uses caller-supplied fields instead of the defaults/auto-detection when given', () => {
    const dto: SimulateHumanTransferDto = {
      customerUtterance: 'sounds fine',
      detectedIntent: 'interest',
      groundedInKnowledgeBase: false,
      confidence: 0.2,
      llmRequestedTransfer: true,
    };

    void controller.simulate('call-2', dto);

    expect(intentService.detect).not.toHaveBeenCalled();
    expect(humanTransferService.evaluateAndTransfer).toHaveBeenCalledWith(
      'call-2',
      {
        customerUtterance: 'sounds fine',
        detectedIntent: 'interest',
        groundedInKnowledgeBase: false,
        confidence: 0.2,
        llmRequestedTransfer: true,
      },
    );
  });
});
