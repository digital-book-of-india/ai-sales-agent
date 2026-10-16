// Shape + defaults for the system_settings row that drives
// HumanTransferService's deterministic trigger checks (see
// ../calling/human-transfer/human-transfer-triggers.util.ts). Kept separate
// from system-settings.service.ts, same reasoning as lead-scoring.config.ts.

export const HUMAN_TRANSFER_SETTINGS_KEY = 'human_transfer';

export interface HumanTransferConfig {
  /** Below this (0-1) confidence, the AI's own turn is treated as unsure
   * enough to hand off — see ReasonOutcome.confidence in
   * llm-reasoner.service.ts. */
  lowConfidenceThreshold: number;
  /** Lead.leadScore at/above which a lead counts as high-value on its own,
   * even with no other trigger firing (Lead.priority === 'HIGH' always
   * counts too, regardless of score). */
  highValueLeadScore: number;
  /** Substrings (case-insensitive) that mean the customer is explicitly
   * asking to speak to a person. */
  explicitRequestKeywords: string[];
  /** Substrings that mean the customer is trying to negotiate price/terms. */
  negotiationKeywords: string[];
  /** Substrings that mean the customer is ready to move forward right now —
   * a stronger signal than IntentDetectionService's general 'interest'
   * label (see intent-detection.service.ts). */
  highIntentKeywords: string[];
}

// English + Hindi/Hinglish (Latin + Devanagari), same bilingual convention
// as intent-detection.service.ts's own keyword lists.
export const DEFAULT_HUMAN_TRANSFER_CONFIG: HumanTransferConfig = {
  lowConfidenceThreshold: 0.5,
  highValueLeadScore: 85,
  explicitRequestKeywords: [
    'talk to a person',
    'talk to a human',
    'talk to someone',
    'speak to a person',
    'speak to a human',
    'speak to someone',
    'real person',
    'human agent',
    'talk to your manager',
    'speak to your manager',
    'talk to a manager',
    'connect me to',
    'transfer me',
    'someone from your team',
    'insaan se baat',
    'aadmi se baat',
    'kisi se baat karao',
    'manager se baat',
    'किसी और से बात',
  ],
  negotiationKeywords: [
    'negotiate',
    'negotiable',
    'better price',
    'best price',
    'can you do better',
    'lower the price',
    'reduce the price',
    'any discount',
    'more discount',
    'final price',
    'best deal',
    'kam karo',
    'discount milega',
    'thoda kam',
    'price kam karo',
    'daam kam',
  ],
  highIntentKeywords: [
    "let's go ahead",
    'i want to buy',
    'sign me up',
    'ready to proceed',
    'book it',
    'i am ready',
    "let's do it",
    'proceed with the purchase',
    "let's finalize",
    'go ahead and book',
    'aage badhte hain',
    'kar dijiye',
    'book kar dijiye',
    'ready hoon',
    'finalize kar dete hain',
  ],
};
