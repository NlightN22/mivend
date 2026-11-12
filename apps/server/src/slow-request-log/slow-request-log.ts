export interface ActorContext {
    session?: { user?: { channelPermissions?: { code: string }[] } } | null;
}

export function isSlow(durationMs: number, thresholdMs: number): boolean {
    return durationMs > thresholdMs;
}

export function actorLabel(ctx: ActorContext | undefined): string {
    const codes = ctx?.session?.user?.channelPermissions?.map(p => p.code) ?? [];
    if (!ctx?.session?.user) return 'anonymous';
    const unique = [...new Set(codes.map(c => (c === '__customer_role__' ? 'customer' : c)))];
    return unique.length > 0 ? unique.sort().join(',') : 'customer';
}

export function formatSlowOperation(
    api: string,
    operationName: string | null | undefined,
    durationMs: number,
    actor: string,
): string {
    const name =
        operationName && /^[A-Za-z0-9_]{1,80}$/.test(operationName)
            ? operationName
            : 'anonymous-operation';
    return `${api} ${name} took ${Math.round(durationMs)} ms (actor: ${actor})`;
}

export function envMs(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return raw && Number.isFinite(n) && n > 0 ? n : fallback;
}
