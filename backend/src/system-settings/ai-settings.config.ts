// Shape + defaults for the system_settings row backing the Settings page's
// "AI" section (Prompt 20). Org-wide fallback only — an individual AiAgent
// (see the AiAgent model in schema.prisma) already carries its own
// language/voice/persona and is what VoiceSessionService actually uses for a
// call; this is just what a new agent (or the Settings page itself) defaults
// to, plus which agent campaigns should pick when none is specified.

export const AI_SETTINGS_KEY = 'ai';

export type AiResponseStyle = 'concise' | 'friendly' | 'formal' | 'persuasive';

export interface AiSettings {
  /** AiAgent.id to preselect when creating a campaign — null until an admin
   * picks one (the agent list itself lives in the ai_agents table, not here). */
  defaultAgentId: string | null;
  /** BCP-47 tag passed to the STT/TTS providers, e.g. "en-IN", "hi-IN". */
  defaultLanguage: string;
  /** Provider-specific voice id (see tts provider implementations under
   * ../calling/ai-voice/tts). */
  defaultVoice: string;
  defaultResponseStyle: AiResponseStyle;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  defaultAgentId: null,
  defaultLanguage: 'en-IN',
  defaultVoice: 'meera',
  defaultResponseStyle: 'friendly',
};
