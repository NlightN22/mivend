export interface ActorContext {
    apiType?: string;
    session?: { user?: { isSuperAdmin?: boolean } | null } | null;
}

export function isSlow(durationMs: number, thresholdMs: number): boolean {
    return durationMs > thresholdMs;
}

export function actorLabel(ctx: ActorContext | undefined): string {
    const user = ctx?.session?.user;
    if (!user) return 'anonymous';
    if (user.isSuperAdmin) return 'super-admin';
    return ctx?.apiType === 'admin' ? 'staff' : 'customer';
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

// Vendure stores { default, withTransactionManager } under the key, not the RequestContext itself.
export function requestContextOf(contextValue: unknown): ActorContext | undefined {
    const req = (contextValue as { req?: Record<string, unknown> } | undefined)?.req;
    const item = req?.['vendureRequestContext'] as
        | { default?: ActorContext; withTransactionManager?: ActorContext }
        | undefined;
    return item?.default ?? item?.withTransactionManager;
}
