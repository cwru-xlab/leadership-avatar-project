/**
 * The language a case-play attempt is conducted in.
 *
 * One selection drives three consumers, which is the point of keeping it here:
 *   - speech-to-text  (ISO-639-1 `code`, pins gpt-4o-transcribe)
 *   - the role's LLM  (`name`, stated in the system prompt)
 *   - the HeyGen avatar voice (`code`, via avatar_persona.language)
 *
 * Pinning it in all three places is also what stops a misrecognized clip from
 * dragging a conversation into a language nobody chose.
 */

export interface AttemptLanguage {
  /** ISO-639-1, what the transcription and avatar APIs expect. */
  code: string;
  /** Shown in the picker, in the language itself. */
  label: string;
  /** English name, used when instructing the LLM. */
  name: string;
}

export const ATTEMPT_LANGUAGES: readonly AttemptLanguage[] = [
  { code: "en", label: "English", name: "English" },
  { code: "es", label: "Español", name: "Spanish" },
  { code: "fr", label: "Français", name: "French" },
  { code: "de", label: "Deutsch", name: "German" },
  { code: "pt", label: "Português", name: "Portuguese" },
  { code: "zh", label: "中文", name: "Chinese" },
  { code: "hi", label: "हिन्दी", name: "Hindi" },
  { code: "ko", label: "한국어", name: "Korean" },
  { code: "ja", label: "日本語", name: "Japanese" },
] as const;

export const DEFAULT_ATTEMPT_LANGUAGE = ATTEMPT_LANGUAGES[0]; // English

/** Resolve a stored/transported code, falling back to the default. */
export function resolveAttemptLanguage(code: string | undefined | null): AttemptLanguage {
  if (!code) return DEFAULT_ATTEMPT_LANGUAGE;
  const normalized = code.trim().toLowerCase().split(/[-_]/)[0];
  return (
    ATTEMPT_LANGUAGES.find((l) => l.code === normalized) ?? DEFAULT_ATTEMPT_LANGUAGE
  );
}
