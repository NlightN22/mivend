export const LAG_THRESHOLD = 1000n;

export function isLagOverThreshold(lag: string | null): boolean {
    return lag !== null && BigInt(lag) > LAG_THRESHOLD;
}

export const DRIFT_MESSAGES: Record<string, string> = {
    NOT_CONSUMED: 'Stream not consumed — add a handler or mark it explicitly ignored',
    NOT_IN_CONTRACT: 'Stale or renamed stream — configured but absent from the contract',
    UNKNOWN_STREAM: 'Unknown stream — present in inbox or lag data but not in contract or config',
};

export function formatAge(from: string | null, now: number): string {
    if (!from) return '—';
    const minutes = Math.max(0, Math.round((now - new Date(from).getTime()) / 60000));
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h`;
    return `${Math.round(minutes / 1440)} d`;
}
