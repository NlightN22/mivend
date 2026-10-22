import type { ChildProcess } from 'child_process';

// Calls onFail once: when a stack process dies while tests run, or when the run outlives timeoutMs.
export function watchStack(
    stack: ChildProcess[],
    timeoutMs: number,
    onFail: (reason: string) => void,
): () => void {
    let fired = false;
    const fail = (reason: string): void => {
        if (fired) return;
        fired = true;
        cancel();
        onFail(reason);
    };
    const listeners = stack.map(child => {
        const listener = (code: number | null, signal: string | null): void =>
            fail(`stack process ${child.pid} exited (${code ?? signal}) during the run`);
        child.once('exit', listener);
        if (child.exitCode !== null) fail(`stack process ${child.pid} was already gone`);
        return { child, listener };
    });
    const timer = setTimeout(() => fail(`run exceeded ${timeoutMs / 60_000} min`), timeoutMs);
    function cancel(): void {
        clearTimeout(timer);
        for (const { child, listener } of listeners) child.off('exit', listener);
    }
    return cancel;
}
