import { normalizePhrase } from './legal-name-abbreviation';

export const MAX_PHRASE_LENGTH = 160;
export const MAX_ABBREVIATION_LENGTH = 20;

export interface LegalNameAbbreviationInput {
    phrase: string;
    abbreviation: string;
}

// Returns the cleaned input or the list of problems; '|' would break the ST00012 field separator.
export function cleanAbbreviationInput(
    input: LegalNameAbbreviationInput,
): { ok: true; value: LegalNameAbbreviationInput } | { ok: false; problems: string[] } {
    const phrase = normalizePhrase(input.phrase);
    const abbreviation = input.abbreviation.trim();
    const problems: string[] = [];
    if (phrase === '') problems.push('phrase must not be empty');
    if (phrase.length > MAX_PHRASE_LENGTH) {
        problems.push(`phrase must be at most ${MAX_PHRASE_LENGTH} characters`);
    }
    if (abbreviation === '') problems.push('abbreviation must not be empty');
    if (abbreviation.length > MAX_ABBREVIATION_LENGTH) {
        problems.push(`abbreviation must be at most ${MAX_ABBREVIATION_LENGTH} characters`);
    }
    if (/[|\p{Cc}]/u.test(abbreviation)) {
        problems.push('abbreviation must not contain "|" or control characters');
    }
    return problems.length > 0
        ? { ok: false, problems }
        : { ok: true, value: { phrase, abbreviation } };
}
