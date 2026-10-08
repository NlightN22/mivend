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

export const VERSION_DRIFT_MESSAGES: Record<
    string,
    { title: string; text: (installed: string, latest: string | null) => string } | undefined
> = {
    BEHIND: {
        title: 'is outdated',
        text: (i, l) =>
            `mivend uses v${i}, the latest published version is v${l}. Streams or fields may be missing.`,
    },
    AHEAD: {
        title: 'is newer than the published latest',
        text: (i, l) => `mivend uses v${i}, the registry reports v${l}.`,
    },
    UNKNOWN: {
        title: 'version could not be checked',
        text: i =>
            `mivend uses v${i}. The latest published version is unknown (registry token not configured or registry unreachable).`,
    },
};

export function outboundTypesWith(
    rows: ReadonlyArray<{ eventType: string; failed: number; skipped: number }>,
    key: 'failed' | 'skipped',
): string[] {
    return rows.filter(r => r[key] > 0).map(r => r.eventType);
}

export interface VariantOrganizationHealth {
    total: number;
    withoutOrganization: number;
}

export function formatVariantOrganizationLine(health: VariantOrganizationHealth): {
    text: string;
    problem: boolean;
} {
    return {
        text: `${health.withoutOrganization} of ${health.total} enabled variants have no organization and cannot be ordered`,
        problem: health.withoutOrganization > 0,
    };
}
