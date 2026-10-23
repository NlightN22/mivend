import { execSync } from 'node:child_process';

// Process control for manager/resilience: only the throwaway e2e stack's server, found by its database.
export function findServerPid(): number {
    const dbName = process.env.E2E_DB_NAME;
    if (!dbName) throw new Error('E2E_DB_NAME is unset; run via make e2e-resilience');
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
        if (environ.split('\n').includes(`DB_NAME=${dbName}`)) {
            return Number(pid);
        }
    }
    throw new Error(`No e2e stack server (src/main.ts) found with DB_NAME=${dbName}`);
}

export function freezeServer(pid: number): void {
    execSync(`kill -STOP ${pid}`);
}

export function resumeServer(pid: number): void {
    execSync(`kill -CONT ${pid}`);
}
