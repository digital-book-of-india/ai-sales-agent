import { IntentDetectionService } from './intent-detection.service';

describe('IntentDetectionService', () => {
  const service = new IntentDetectionService();

  it('detects an English objection', () => {
    expect(service.detect("It's too expensive, not interested")).toBe(
      'objection',
    );
  });

  it('detects a Hinglish objection', () => {
    expect(service.detect('Yeh mehenga hai, zarurat nahi hai')).toBe(
      'objection',
    );
  });

  it('detects a pricing question', () => {
    expect(service.detect('What is the pricing for this plan?')).toBe(
      'pricing',
    );
  });

  it('detects a short greeting', () => {
    expect(service.detect('Hello, namaste')).toBe('greeting');
  });

  it('detects interest', () => {
    expect(service.detect('Sure, tell me more about it')).toBe('interest');
  });

  it('detects a generic question', () => {
    expect(service.detect('How does this work?')).toBe('question');
  });

  it('falls back to other for plain statements', () => {
    expect(service.detect('My company is based in Pune')).toBe('other');
  });

  it('builds a retrieval query from the trimmed utterance', () => {
    expect(service.buildRetrievalQuery('  what are your charges?  ')).toBe(
      'what are your charges?',
    );
  });
});
