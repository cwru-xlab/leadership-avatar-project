const SENTENCE_END = /[.!?…](?=\s|$)|\n/;
const MIN_SPEAK_CHARS = 20;
const MAX_SPEAK_CHARS = 220;

/**
 * Pull complete, natural speaking chunks from a streamed response.
 *
 * Avatar TTS can begin as soon as the model finishes a sentence without waiting
 * for the complete response. Short fragments are held until there is enough
 * context to sound natural; very long unpunctuated passages are cut at a comma
 * or hard limit so speech never stalls indefinitely.
 */
export function extractSpeakable(buffer: string): {
  chunks: string[];
  rest: string;
} {
  const chunks: string[] = [];
  let rest = buffer;

  for (;;) {
    const match = rest.match(SENTENCE_END);
    if (match && match.index !== undefined) {
      const end = match.index + match[0].length;
      const candidate = rest.slice(0, end).trim();

      if (candidate.length >= MIN_SPEAK_CHARS) {
        chunks.push(candidate);
        rest = rest.slice(end);
        continue;
      }

      const next = rest.slice(end).match(SENTENCE_END);
      if (!next) break;
      const merged = rest
        .slice(0, end + next.index! + next[0].length)
        .trim();
      chunks.push(merged);
      rest = rest.slice(end + next.index! + next[0].length);
      continue;
    }

    if (rest.length > MAX_SPEAK_CHARS) {
      const comma = rest.lastIndexOf(",", MAX_SPEAK_CHARS);
      const cutAt = comma > MIN_SPEAK_CHARS ? comma + 1 : MAX_SPEAK_CHARS;
      chunks.push(rest.slice(0, cutAt).trim());
      rest = rest.slice(cutAt);
      continue;
    }

    break;
  }

  return { chunks, rest };
}
