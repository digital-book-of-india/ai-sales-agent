import { deriveNextLeadStatus } from './lead-status.util';
import {
  CallIntent,
  CallSentiment,
  DecisionMaker,
  LeadStatus,
} from '../../../generated/prisma/enums';

function input(
  overrides: Partial<Parameters<typeof deriveNextLeadStatus>[1]> = {},
) {
  return {
    demoRequested: false,
    decisionMaker: DecisionMaker.UNKNOWN,
    intent: CallIntent.NONE,
    sentiment: CallSentiment.NEUTRAL,
    ...overrides,
  };
}

describe('deriveNextLeadStatus', () => {
  it('never moves a lead out of a locked terminal status', () => {
    for (const locked of [
      LeadStatus.WON,
      LeadStatus.LOST,
      LeadStatus.INVALID,
      LeadStatus.NOT_INTERESTED,
    ]) {
      expect(
        deriveNextLeadStatus(
          locked,
          input({
            demoRequested: true,
            decisionMaker: DecisionMaker.YES,
            intent: CallIntent.HIGH,
          }),
        ),
      ).toBe(locked);
    }
  });

  it('moves to DEMO_SCHEDULED when a demo was requested, regardless of other signals', () => {
    expect(
      deriveNextLeadStatus(
        LeadStatus.NEW,
        input({ demoRequested: true, sentiment: CallSentiment.NEGATIVE }),
      ),
    ).toBe(LeadStatus.DEMO_SCHEDULED);
  });

  it('moves to NOT_INTERESTED on negative sentiment with no positive intent', () => {
    expect(
      deriveNextLeadStatus(
        LeadStatus.CONTACTED,
        input({ sentiment: CallSentiment.NEGATIVE, intent: CallIntent.LOW }),
      ),
    ).toBe(LeadStatus.NOT_INTERESTED);
  });

  it('does not flag NOT_INTERESTED when sentiment is negative but intent is still positive', () => {
    expect(
      deriveNextLeadStatus(
        LeadStatus.CONTACTED,
        input({ sentiment: CallSentiment.NEGATIVE, intent: CallIntent.HIGH }),
      ),
    ).not.toBe(LeadStatus.NOT_INTERESTED);
  });

  it('moves to QUALIFIED when a confirmed decision maker shows positive intent', () => {
    expect(
      deriveNextLeadStatus(
        LeadStatus.NEW,
        input({ decisionMaker: DecisionMaker.YES, intent: CallIntent.MEDIUM }),
      ),
    ).toBe(LeadStatus.QUALIFIED);
  });

  it('moves to INTERESTED on positive intent alone, without a confirmed decision maker', () => {
    expect(
      deriveNextLeadStatus(LeadStatus.NEW, input({ intent: CallIntent.HIGH })),
    ).toBe(LeadStatus.INTERESTED);
  });

  it('falls back to CONTACTED when nothing stands out', () => {
    expect(deriveNextLeadStatus(LeadStatus.NEW, input())).toBe(
      LeadStatus.CONTACTED,
    );
  });

  it('advances CALL_LATER (not a locked status) the same as any other open status', () => {
    expect(
      deriveNextLeadStatus(
        LeadStatus.CALL_LATER,
        input({ intent: CallIntent.HIGH }),
      ),
    ).toBe(LeadStatus.INTERESTED);
  });
});
