const MAX_LENGTH = 300;

// Stored errors are raw exception messages and can echo row values (a constraint "Key (col)=(value)", an email).
export function sanitizeErrorText(text: string | null): string | null {
    if (text === null) return null;
    const masked = text
        .replace(/\(([^()]*)\)=\([^()]*\)/g, '($1)=(…)')
        .replace(/[^\s@()<>,;'"]+@[^\s@()<>,;'"]+/g, '[email]');
    return masked.length > MAX_LENGTH ? `${masked.slice(0, MAX_LENGTH)}…` : masked;
}
