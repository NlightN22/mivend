import { createHash, timingSafeEqual } from 'node:crypto';

// Backend-only (Node's `crypto`) — same "never touched by Vite" carve-out as aggregate-lock.ts.
export const API_KEY_MIN_LENGTH = 16;

export interface ApiKeyHeaders {
    [name: string]: string | string[] | undefined;
}

export interface ApiKeyOptions {
    rejectValues?: readonly string[];
}

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export function extractApiKey(headers: ApiKeyHeaders): string | undefined {
    const direct = first(headers['x-api-key'])?.trim();
    if (direct) return direct;
    const bearer = /^Bearer\s+(.+)$/i.exec(first(headers['authorization']) ?? '');
    return bearer?.[1]?.trim() || undefined;
}

export function isApiKeyUsable(
    key: string | undefined,
    options: ApiKeyOptions = {},
): key is string {
    return (
        typeof key === 'string' &&
        key.length >= API_KEY_MIN_LENGTH &&
        !(options.rejectValues ?? []).includes(key)
    );
}

// Digests make both buffers equal-length, so a length mismatch neither throws nor leaks length.
export function verifyApiKey(
    headers: ApiKeyHeaders,
    configuredKey: string | undefined,
    options: ApiKeyOptions = {},
): boolean {
    if (!isApiKeyUsable(configuredKey, options)) return false;
    const provided = extractApiKey(headers);
    if (!provided) return false;
    const a = createHash('sha256').update(provided).digest();
    const b = createHash('sha256').update(configuredKey).digest();
    return timingSafeEqual(a, b);
}

// Fail closed: a REST surface is mounted only when its flag is exactly "true"; a flag on with an
// unusable key still mounts (the guard refuses every call) but logs a clear startup error.
export function isRestSurfaceEnabled(
    flagVar: string,
    keyVar: string,
    options: ApiKeyOptions = {},
): boolean {
    if (process.env[flagVar] !== 'true') return false;
    if (!isApiKeyUsable(process.env[keyVar], options)) {
        console.error(
            `[security] ${flagVar}=true but ${keyVar} is missing or shorter than ` +
                `${API_KEY_MIN_LENGTH} characters — every request to this REST surface is refused.`,
        );
    }
    return true;
}
