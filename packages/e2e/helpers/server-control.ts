import { execSync } from 'node:child_process';

// Local-dev-only process control for resilience E2E tests (see
// manager/resilience/connection-recovery.spec.ts) — bare-metal `make dev` process only, never a container.

const INSTANCE_ID = process.env.SERVER_INSTANCE_ID ?? 'central';

// Finds the local Vendure server (apps/server's src/main.ts) by its own INSTANCE_ID env var —
// never by port alone, since staging-integration's server also binds a port on this host.
export function findServerPid(): number {
    const pids = execSync(`pgrep -f "src/main.ts"`, { encoding: 'utf8' })
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
    for (const pid of pids) {
        let environ: string;
        try {
            environ = execSync(`tr '\\0' '\\n' < /proc/${pid}/environ`, { encoding: 'utf8' });
        } catch {
            continue; // process exited between pgrep and this read, or unreadable — skip it
        }
        if (environ.split('\n').includes(`INSTANCE_ID=${INSTANCE_ID}`)) {
            return Number(pid);
        }
    }
    throw new Error(
        `No running src/main.ts process found with INSTANCE_ID=${INSTANCE_ID}. ` +
            `This test requires a bare-metal local dev server (\`make dev\`), not a container.`,
    );
}

export function freezeServer(pid: number): void {
    execSync(`kill -STOP ${pid}`);
}

export function resumeServer(pid: number): void {
    execSync(`kill -CONT ${pid}`);
}
