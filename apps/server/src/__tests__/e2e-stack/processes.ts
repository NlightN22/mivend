import { spawn, type ChildProcess } from 'child_process';
import { connect } from 'net';
import { resolve } from 'path';

import { spawnCommandGroup, spawnGroup, waitForUrl } from '../access/harness/server-process';
import { E2E_PORTS, REPO_ROOT, STACK_DIR, portalBackendPorts } from './stack-env';

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
    const ports = [
        ...Object.values(E2E_PORTS),
        ...portalBackendPorts(E2E_PORTS.storefront),
        ...portalBackendPorts(E2E_PORTS.manager),
    ];
    for (const port of ports)
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

// One Vite dev server serves every module request on a single thread, so parallel workers queue on it.
// Several instances sit behind a TCP balancer on the portal port.
export function spawnPortal(pkg: 'storefront' | 'manager', port: number): ChildProcess[] {
    const backends = portalBackendPorts(port);
    const instances = backends.map((backendPort, i) =>
        spawnCommandGroup({
            command: 'pnpm',
            args: ['--filter', `@mivend/${pkg}`, 'exec', 'vite', '--strictPort'],
            cwd: REPO_ROOT,
            env: {
                VITE_API_TARGET: `http://localhost:${E2E_PORTS.server}`,
                VITE_PORT: String(backendPort),
            },
            logPath: log(`${pkg}-${i}`),
        }),
    );
    const balancer = spawnCommandGroup({
        command: 'node',
        args: ['infrastructure/scripts/e2e-tcp-balance.mjs', String(port), ...backends.map(String)],
        cwd: REPO_ROOT,
        env: {},
        logPath: log(`${pkg}-balancer`),
    });
    return [...instances, balancer];
}

export function spawnMockOidcProvider(): ChildProcess {
    return spawnCommandGroup({
        command: 'node',
        args: ['packages/e2e/helpers/mock-oidc-provider.mjs'],
        cwd: REPO_ROOT,
        env: { MOCK_OIDC_PORT: String(E2E_PORTS.oidc) },
        logPath: log('mock-oidc'),
    });
}

export function waitForMockOidcProvider(child: ChildProcess): Promise<void> {
    return waitForUrl(
        `http://localhost:${E2E_PORTS.oidc}/realms/staff/.well-known/openid-configuration`,
        child,
        log('mock-oidc'),
    );
}

export async function waitForPortal(
    processes: ChildProcess[],
    pkg: string,
    port: number,
): Promise<void> {
    const ports = [...portalBackendPorts(port), port];
    await Promise.all(
        ports.map((p, i) => waitForUrl(`http://localhost:${p}`, processes[i], log(`${pkg}-${i}`))),
    );
}

export function runForeground(
    command: string[],
    env: Record<string, string>,
    onSpawn?: (child: ChildProcess) => void,
): Promise<number> {
    return new Promise((done, fail) => {
        // Own group, so teardown kills the whole tree (pnpm, Playwright, Chrome), not just pnpm.
        const child = spawn(command[0], command.slice(1), {
            cwd: REPO_ROOT,
            env: { ...process.env, ...env },
            stdio: 'inherit',
            detached: true,
        });
        onSpawn?.(child);
        child.once('error', fail);
        child.once('exit', (code, signal) => done(code ?? (signal ? 1 : 0)));
    });
}
