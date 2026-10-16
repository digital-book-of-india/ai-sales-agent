import { Injectable } from '@nestjs/common';
import type { DetectedIntent } from './conversation-state';

/**
 * Cheap, deterministic keyword/rule classifier — not an ML model. Its job is
 * narrow: bias knowledge retrieval (see KnowledgeRetrievalService) toward
 * objections vs. FAQs vs. plain dialogue, and surface a label on the
 * conversation state for the live call monitor. The actual understanding of
 * *what to say* is left entirely to the LLM reasoning step, which sees the
 * raw transcript — this step never blocks or filters what reaches it.
 */
@Injectable()
export class IntentDetectionService {
  private readonly objectionKeywords = [
    // English
    'expensive',
    'too much',
    'cannot afford',
    "can't afford",
    'not interested',
    'already have',
    'already using',
    'call later',
    'call me later',
    'busy right now',
    'no time',
    'not now',
    'think about it',
    'not sure',
    // Hindi / Hinglish (Latin + Devanagari)
    'mehenga',
    'mehnga',
    'zarurat nahi',
    'interested nahi',
    'baad me',
    'baad mein',
    'busy hoon',
    'time nahi',
    'sochna hai',
    'pehle se hai',
    'नहीं चाहिए',
    'महंगा',
    'व्यस्त',
  ];

  private readonly pricingKeywords = [
    'price',
    'cost',
    'pricing',
    'how much',
    'charges',
    'fee',
    'discount',
    'offer',
    'kitna',
    'kimat',
    'keemat',
    'daam',
    'price kya',
  ];

  private readonly greetingKeywords = [
    'hello',
    'hi ',
    'hey',
    'namaste',
    'namaskar',
  ];

  private readonly interestKeywords = [
    'interested',
    'tell me more',
    'sounds good',
    'sure',
    'okay send',
    'haan',
    'ha bataiye',
    'batao',
    'accha laga',
  ];

  private readonly questionMarkers = [
    '?',
    'kya',
    'kaise',
    'kab',
    'kahan',
    'why',
    'how',
    'when',
    'where',
    'what',
  ];

  /** Detects a single dominant intent for one customer utterance. Order
   * matters — objection/pricing take priority over a generic "interest" or
   * "question" read on the same sentence. */
  detect(text: string): DetectedIntent {
    const normalized = text.toLowerCase();

    if (this.matchesAny(normalized, this.objectionKeywords)) return 'objection';
    if (this.matchesAny(normalized, this.pricingKeywords)) return 'pricing';
    if (
      this.matchesAny(normalized, this.greetingKeywords) &&
      normalized.length < 30
    ) {
      return 'greeting';
    }
    if (this.matchesAny(normalized, this.interestKeywords)) return 'interest';
    if (this.matchesAny(normalized, this.questionMarkers)) return 'question';

    return 'other';
  }

  /** Query text to feed knowledge retrieval — for now just the utterance
   * itself, kept as its own method so retrieval-query shaping (e.g. folding
   * in the previous turn for context) can evolve independently of intent
   * labeling. */
  buildRetrievalQuery(utterance: string): string {
    return utterance.trim();
  }

  private matchesAny(normalized: string, keywords: string[]): boolean {
    return keywords.some((keyword) => normalized.includes(keyword));
  }
}
