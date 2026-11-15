import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { z } from 'zod';

export const ADDRESS_MIN_LENGTH = 10;
export const WORKING_HOURS_MAX_LENGTH = 200;
export const EMAIL_MAX_LENGTH = 254;

const emailSchema = z.string().max(EMAIL_MAX_LENGTH).email();
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizePhone(raw: string): string | null {
    const parsed = parsePhoneNumberFromString(raw, 'RU');
    return parsed?.isValid() ? parsed.formatInternational() : null;
}

export function normalizePhoneE164(raw: string): string | null {
    const parsed = parsePhoneNumberFromString(raw, 'RU');
    return parsed?.isValid() ? parsed.number : null;
}

export function isValidPhone(raw: string): boolean {
    return normalizePhone(raw) !== null;
}

export function isValidPersonName(raw: string): boolean {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.every(w => /\p{L}{2,}|^\p{L}\.$/u.test(w));
}

export function isValidAddress(raw: string): boolean {
    const v = raw.trim();
    return v.length >= ADDRESS_MIN_LENGTH && /\d/.test(v) && /\p{L}/u.test(v);
}

export function isValidEmail(raw: string): boolean {
    return emailSchema.safeParse(raw).success;
}

const HOURS_RANGE = /^(\d{2}):(\d{2})\u2013(\d{2}):(\d{2})$/u;

// Text with letters is a legacy or preset value and is only length-checked; digits must form a real HH:MM–HH:MM range.
export function isValidWorkingHours(raw: string): boolean {
    const value = raw.trim();
    if (value.length > WORKING_HOURS_MAX_LENGTH) return false;
    if (/\p{L}/u.test(value)) return true;
    const match = HOURS_RANGE.exec(value);
    if (!match) return false;
    const [a, b, c, d] = match.slice(1).map(Number);
    return a < 24 && c < 24 && b < 60 && d < 60;
}

// Rejects 30.02-style overflow instead of rolling it forward.
export function isValidIsoDate(raw: string): boolean {
    const match = ISO_DATE.exec(raw);
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

export type DatePeriodError = 'invalidFrom' | 'invalidTo' | 'endBeforeStart';

// An empty side is an explicit open end, not an error.
export function datePeriodError(from: string, to: string): DatePeriodError | null {
    if (from && !isValidIsoDate(from)) return 'invalidFrom';
    if (to && !isValidIsoDate(to)) return 'invalidTo';
    if (from && to && to < from) return 'endBeforeStart';
    return null;
}
