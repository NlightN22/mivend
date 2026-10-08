export type ContractVersionStatus = 'UP_TO_DATE' | 'BEHIND' | 'AHEAD' | 'UNKNOWN';

export interface ContractVersionDrift {
    installed: string;
    latest: string | null;
    status: ContractVersionStatus;
}

function parse(version: string): number[] {
    return version.split('.').map(part => Number.parseInt(part, 10) || 0);
}

export function compareContractVersions(
    installed: string,
    latest: string | null,
): ContractVersionDrift {
    if (latest === null) return { installed, latest, status: 'UNKNOWN' };
    const a = parse(installed);
    const b = parse(latest);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        if (diff !== 0) return { installed, latest, status: diff < 0 ? 'BEHIND' : 'AHEAD' };
    }
    return { installed, latest, status: 'UP_TO_DATE' };
}
