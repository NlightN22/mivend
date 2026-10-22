import { spawn, type ChildProcess } from 'child_process';
import { createWriteStream } from 'fs';
import { createServer } from 'net';
import { resolve } from 'path';

const SERVER_DIR = resolve(__dirname, '../../../..');
const BOOT_TIMEOUT_MS = 240_000;

export interface RunningServer {
    baseUrl: string;
    stop(): Promise<void>;
}

export async function freePort(): Promise<number> {
    return new Promise((done, fail) => {
        const probe = createServer();
        probe.once('error', fail);
        probe.listen(0, '127.0.0.1', () => {
            const address = probe.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            probe.close(() => done(port));
        });
    });
}

export async function waitForUrl(url: string, child: ChildProcess, logPath: string): Promise<void> {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (child.exitCode !== null)
            throw new Error(`${url}: the process exited with ${child.exitCode}, see ${logPath}`);
        const healthy = await fetch(url).then(
            r => r.ok,
            () => false,
        );
        if (healthy) return;
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`${url} did not become healthy in time, see ${logPath}`);
}

export function stopGroup(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.pid === undefined) return Promise.resolve();
    const pid = child.pid;
    return new Promise(done => {
        const force = setTimeout(() => {
            try {
                process.kill(-pid, 'SIGKILL');
            } catch {
                // already gone
            }
        }, 15_000);
        child.once('exit', () => {
            clearTimeout(force);
            done();
        });
        process.kill(-pid, 'SIGTERM');
    });
}

export interface GroupSpawn {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    logPath: string;
}

// Detached: the process and the Chrome it launches form one process group, stopped together.
export function spawnCommandGroup(spec: GroupSpawn): ChildProcess {
    const log = createWriteStream(spec.logPath);
    const child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);
    return child;
}

export function spawnGroup(
    script: string,
    env: Record<string, string>,
    logPath: string,
): ChildProcess {
    return spawnCommandGroup({
        command: 'node_modules/.bin/ts-node',
        args: ['--transpile-only', script],
        cwd: SERVER_DIR,
        env,
        logPath,
    });
}

// Not awaited: the worker has no health endpoint; the seed waits for the PDFs it renders.
export function startPdfWorker(env: Record<string, string>, logPath: string): () => Promise<void> {
    const child = spawnGroup('src/__tests__/access/harness/pdf-worker.ts', env, logPath);
    return () => stopGroup(child);
}

export async function startServer(
    env: Record<string, string>,
    logPath: string,
): Promise<RunningServer> {
    const port = await freePort();
    const child = spawnGroup('src/main.ts', { ...env, PORT: String(port) }, logPath);
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        await waitForUrl(`${baseUrl}/health`, child, logPath);
    } catch (error) {
        await stopGroup(child);
        throw error;
    }
    return { baseUrl, stop: () => stopGroup(child) };
}
