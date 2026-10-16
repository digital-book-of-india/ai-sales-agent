import { NotFoundException } from '@nestjs/common';
import { ConversationStateService } from './conversation-state.service';

describe('ConversationStateService', () => {
  let service: ConversationStateService;

  beforeEach(() => {
    service = new ConversationStateService();
  });

  it('throws NotFoundException for an unknown call', () => {
    expect(() => service.get('missing')).toThrow(NotFoundException);
  });

  it('starts a session with defaults and tracks turns', () => {
    service.start('call-1', 'agent-1', 'en-IN');
    expect(service.has('call-1')).toBe(true);

    service.appendTurn('call-1', {
      role: 'agent',
      kind: 'scripted_opening',
      text: 'Hi, this is Acme calling.',
    });
    service.appendTurn('call-1', {
      role: 'customer',
      kind: 'dialogue',
      text: 'Yeah, what is this about?',
    });

    const state = service.get('call-1');
    expect(state.turns).toHaveLength(2);
    // Only the dialogue turn should surface for LLM context.
    expect(service.dialogueTurns('call-1')).toEqual([
      expect.objectContaining({ text: 'Yeah, what is this about?' }),
    ]);
  });

  it('tracks answered playbook questions and computes the unanswered set', () => {
    service.start('call-1', 'agent-1', 'en-IN');
    service.markQuestionsAnswered('call-1', ['q1', 'q3']);

    expect(
      service.unansweredQuestionIds('call-1', ['q1', 'q2', 'q3', 'q4']),
    ).toEqual(['q2', 'q4']);
  });

  it('updates language and intent', () => {
    service.start('call-1', 'agent-1', 'en-IN');
    service.setLanguage('call-1', 'hi-IN');
    service.setLastIntent('call-1', 'objection');

    const state = service.get('call-1');
    expect(state.languageCode).toBe('hi-IN');
    expect(state.lastIntent).toBe('objection');
  });

  it('end() removes the session', () => {
    service.start('call-1', 'agent-1', 'en-IN');
    service.end('call-1');
    expect(service.has('call-1')).toBe(false);
  });
});
