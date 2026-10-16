/**
 * Buffers streamed LLM text and releases it sentence-by-sentence so TTS can
 * start speaking the first sentence while the model is still generating the
 * rest — the low-latency middle ground between "wait for the whole reply"
 * and "synthesize every token delta" (which no TTS engine can usefully
 * consume). Handles Hindi/Hinglish punctuation (। as well as . ! ?).
 */
export class SentenceChunker {
  private buffer = '';

  private static readonly BOUNDARY = /([.!?।]+)(\s+|$)/;

  /** Feed one text delta. Returns any complete sentences it produced. */
  push(delta: string): string[] {
    this.buffer += delta;
    const sentences: string[] = [];

    let match: RegExpMatchArray | null;
    while ((match = this.buffer.match(SentenceChunker.BOUNDARY))) {
      const boundaryEnd = (match.index ?? 0) + match[0].length;
      const sentence = this.buffer.slice(0, boundaryEnd).trim();
      if (sentence) sentences.push(sentence);
      this.buffer = this.buffer.slice(boundaryEnd);
    }

    return sentences;
  }

  /** Call once the stream ends — returns whatever trailing text never hit a
   * sentence boundary (e.g. a reply with no terminal punctuation). */
  flush(): string | null {
    const remainder = this.buffer.trim();
    this.buffer = '';
    return remainder || null;
  }
}
