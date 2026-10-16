import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';

export interface RetrievedFaq {
  question: string;
  answer: string;
}

export interface RetrievedObjection {
  objection: string;
  recommendedResponse: string;
  followUpQuestion: string | null;
  escalationRule: string | null;
}

/** Everything the LLM reasoner is allowed to treat as fact. Nothing outside
 * this bundle should ever be presented to the customer as company/product
 * information — see LlmReasonerService's system prompt. */
export interface RetrievedKnowledge {
  companyInfo: unknown;
  products: unknown;
  services: unknown;
  faqs: RetrievedFaq[];
  objections: RetrievedObjection[];
}

const EMPTY: RetrievedKnowledge = {
  companyInfo: {},
  products: [],
  services: [],
  faqs: [],
  objections: [],
};

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'to',
  'of',
  'for',
  'and',
  'or',
  'in',
  'on',
  'i',
  'you',
  'it',
  'this',
  'that',
  'do',
  'does',
  'what',
  'how',
  'kya',
  'hai',
  'hain',
  'ka',
  'ki',
  'ke',
  'se',
  'me',
  'main',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u) // Unicode-aware — keeps Devanagari (Hindi) runs intact too
      .filter((token) => token.length > 1 && !STOPWORDS.has(token)),
  );
}

/** Token-overlap score — no embeddings/vector DB in this stack, so this is a
 * deliberately simple, deterministic stand-in. It's enough to surface the
 * handful of FAQs/objections relevant to one utterance out of a small
 * per-agent knowledge base; swap for a real retriever if the KB grows large
 * enough that keyword overlap stops being discriminating. */
function overlapScore(queryTokens: Set<string>, candidate: string): number {
  const candidateTokens = tokenize(candidate);
  let matches = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) matches++;
  }
  return matches;
}

@Injectable()
export class KnowledgeRetrievalService {
  private readonly logger = new Logger(KnowledgeRetrievalService.name);

  constructor(private readonly knowledgeBase: KnowledgeBaseService) {}

  /** Retrieves the knowledge grounding for one turn. `query` is typically
   * the latest customer utterance (see IntentDetectionService); an empty
   * query (start of call) falls back to the highest-priority FAQs so the
   * agent still has something to ground an opening exchange in. */
  async retrieve(
    agentId: string,
    query: string,
    topK = 4,
  ): Promise<RetrievedKnowledge> {
    const kb = await this.knowledgeBase.findByAgent(agentId).catch(() => null);
    if (!kb) {
      this.logger.warn(`No knowledge base configured for agent ${agentId}`);
      return EMPTY;
    }

    const queryTokens = tokenize(query);
    const faqs =
      queryTokens.size === 0
        ? kb.faqs.slice(0, topK)
        : this.topMatches(
            kb.faqs,
            (f) => `${f.question} ${f.answer}`,
            queryTokens,
            topK,
          );
    const objections =
      queryTokens.size === 0
        ? []
        : this.topMatches(kb.objections, (o) => o.objection, queryTokens, topK);

    return {
      companyInfo: kb.companyInfo,
      products: kb.products,
      services: kb.services,
      faqs: faqs.map((f) => ({ question: f.question, answer: f.answer })),
      objections: objections.map((o) => ({
        objection: o.objection,
        recommendedResponse: o.recommendedResponse,
        followUpQuestion: o.followUpQuestion,
        escalationRule: o.escalationRule,
      })),
    };
  }

  private topMatches<T>(
    items: T[],
    textOf: (item: T) => string,
    queryTokens: Set<string>,
    topK: number,
  ): T[] {
    return items
      .map((item) => ({ item, score: overlapScore(queryTokens, textOf(item)) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ item }) => item);
  }
}
