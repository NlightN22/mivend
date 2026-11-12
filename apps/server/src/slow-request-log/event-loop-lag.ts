export const LAG_LOG_INTERVAL_MS = 10_000;

export function shouldLogLag(
    lagMs: number,
    thresholdMs: number,
    nowMs: number,
    lastLoggedMs: number | null,
): boolean {
    if (lagMs <= thresholdMs) return false;
    return lastLoggedMs === null || nowMs - lastLoggedMs >= LAG_LOG_INTERVAL_MS;
}

export interface LagMonitor {
    stop(): void;
}

export function startLagMonitor(
    thresholdMs: number,
    log: (lagMs: number) => void,
    intervalMs = 1000,
): LagMonitor {
    let expected = Date.now() + intervalMs;
    let lastLogged: number | null = null;
    const timer = setInterval(() => {
        const now = Date.now();
        const lag = now - expected;
        expected = now + intervalMs;
        if (shouldLogLag(lag, thresholdMs, now, lastLogged)) {
            lastLogged = now;
            log(Math.round(lag));
        }
    }, intervalMs);
    timer.unref();
    return { stop: () => clearInterval(timer) };
}
