// Digits are masked as HH:MM–HH:MM; text with letters (a preset or a legacy value) is left as typed.
export function applyWorkingHoursInput(raw: string): string {
    if (/\p{L}/u.test(raw)) return raw;
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const head = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2, 4)}` : digits;
    if (digits.length <= 4) return head;
    const tail = digits.slice(4);
    return `${head}–${tail.length > 2 ? `${tail.slice(0, 2)}:${tail.slice(2)}` : tail}`;
}
