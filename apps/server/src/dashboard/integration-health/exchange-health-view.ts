export type ExchangeViewState = 'OK' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export const UNKNOWN_REASON_TEXT: Record<string, string> = {
    NOT_CONFIGURED: 'The Integration Service address or the ops key is not configured.',
    UNAUTHORIZED: 'The Integration Service rejected the ops key (401/403).',
    TIMEOUT: 'The Integration Service did not answer in time.',
    UNREACHABLE: 'The Integration Service could not be reached.',
    SERVER_ERROR: 'The Integration Service answered with an error.',
    BAD_RESPONSE: 'The Integration Service answered with an unexpected body.',
    NEVER_POLLED: 'The exchange health has not been read yet.',
    STALE: 'The exchange health has not been refreshed for several minutes.',
};

export function unknownReasonText(reason: string | null): string {
    return (reason && UNKNOWN_REASON_TEXT[reason]) || 'The exchange health cannot be read.';
}

export function isExchangeState(
    state: string | null | undefined,
    wanted: 'DOWN' | 'DEGRADED',
): boolean {
    return state === wanted;
}

export function stateBadgeVariant(
    state: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (state === 'OK') return 'default';
    if (state === 'DOWN') return 'destructive';
    return 'secondary';
}

export function formatAgeSeconds(seconds: number | null): string {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds} s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
    return `${Math.round(seconds / 86400)} d`;
}
