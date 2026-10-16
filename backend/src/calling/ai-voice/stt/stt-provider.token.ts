/** DI token for the active SpeechToTextProvider — see calling.module.ts for
 * the factory that picks the provider (Sarvam today) based on env config.
 * Same pattern as ../../telephony/telephony-provider.token.ts. */
export const STT_PROVIDER = 'STT_PROVIDER';
