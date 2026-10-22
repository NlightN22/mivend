import { spawn, type ChildProcess } from 'child_process';
import { connect } from 'net';
import { resolve } from 'path';

import { spawnCommandGroup, spawnGroup, waitForUrl } from '../access/harness/server-process';
import { E2E_PORTS, REPO_ROOT, STACK_DIR } from './stack-env';

const log = (name: string): string => resolve(STACK_DIR, `${name}.log`);

function portInUse(port: number): Promise<boolean> {
    return new Promise(done => {
        const socket = connect(port, '127.0.0.1');
        socket.once('connect', () => {
            socket.destroy();
            done(true);
        });
        socket.once('error', () => done(false));
    });
}

export async function assertPortsFree(): Promise<void> {
    for (const port of Object.values(E2E_PORTS))
        if (await portInUse(port))
            throw new Error(`Port ${port} is taken; another e2e stack or service is running`);
}

// The server first: health waits on it, the workers share its database.
export function spawnBackend(env: Record<string, string>): ChildProcess[] {
    return [
        spawnGroup('src/main.ts', env, log('server')),
        spawnGroup('src/worker.ts', env, log('worker')),
        spawnGroup('src/worker-email.ts', env, log('worker-email')),
    ];
}

export function waitForServer(server: ChildProcess): Promise<void> {
    return waitForUrl(`http://127.0.0.1:${E2E_PORTS.server}/health`, server, log('server'));
}

export function spawnPortal(pkg: 'storefront' | 'manager', port: number): ChildProcess {
    return spawnCommandGroup({
        command: 'pnpm',
        args: ['--filter', `@mivend/${pkg}`, 'exec', 'vite', '--strictPort'],
        cwd: REPO_ROOT,
        env: {
            VITE_API_TARGET: `http://localhost:${E2E_PORTS.server}`,
            VITE_PORT: String(port),
        },
        logPath: log(pkg),
    });
}

export function waitForPortal(child: ChildProcess, pkg: string, port: number): Promise<void> {
    return waitForUrl(`http://localhost:${port}`, child, log(pkg));
}

export function runForeground(
    command: string[],
    env: Record<string, string>,
    onSpawn?: (child: ChildProcess) => void,
): Promise<number> {
    return new Promise((done, fail) => {
        const child = spawn(command[0], command.slice(1), {
            cwd: REPO_ROOT,
            env: { ...process.env, ...env },
            stdio: 'inherit',
        });
        onSpawn?.(child);
        child.once('error', fail);
        child.once('exit', (code, signal) => done(code ?? (signal ? 1 : 0)));
    });
}
