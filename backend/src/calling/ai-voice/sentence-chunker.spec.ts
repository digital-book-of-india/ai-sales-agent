import { SentenceChunker } from './sentence-chunker';

describe('SentenceChunker', () => {
  it('releases a sentence only once its terminal punctuation arrives', () => {
    const chunker = new SentenceChunker();

    expect(chunker.push('Sure, we can ')).toEqual([]);
    expect(chunker.push('help with that')).toEqual([]);
    expect(chunker.push('. Let me check.')).toEqual([
      'Sure, we can help with that.',
      'Let me check.',
    ]);
  });

  it('splits multiple sentences delivered in one delta', () => {
    const chunker = new SentenceChunker();
    expect(chunker.push('Hi! How can I help you today?')).toEqual([
      'Hi!',
      'How can I help you today?',
    ]);
  });

  it('handles the Hindi danda as a sentence boundary', () => {
    const chunker = new SentenceChunker();
    expect(chunker.push('Namaste। Aap kaise hain?')).toEqual([
      'Namaste।',
      'Aap kaise hain?',
    ]);
  });

  it('flush() returns trailing text with no terminal punctuation', () => {
    const chunker = new SentenceChunker();
    chunker.push('Let me think about that');
    expect(chunker.flush()).toBe('Let me think about that');
  });

  it('flush() returns null when nothing is buffered', () => {
    const chunker = new SentenceChunker();
    chunker.push('Complete sentence.');
    expect(chunker.flush()).toBeNull();
  });
});
