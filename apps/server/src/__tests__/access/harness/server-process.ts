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

async function waitForHealth(baseUrl: string, child: ChildProcess, logPath: string): Promise<void> {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (child.exitCode !== null)
            throw new Error(`The access test server exited with ${child.exitCode}, see ${logPath}`);
        const healthy = await fetch(`${baseUrl}/health`).then(
            r => r.ok,
            () => false,
        );
        if (healthy) return;
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`The access test server did not become healthy in time, see ${logPath}`);
}

function stopGroup(child: ChildProcess): Promise<void> {
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

export async function startServer(
    env: Record<string, string>,
    logPath: string,
): Promise<RunningServer> {
    const port = await freePort();
    const log = createWriteStream(logPath);
    // Detached: the server and the Chrome it launches form one process group, stopped together.
    const child = spawn('node_modules/.bin/ts-node', ['--transpile-only', 'src/main.ts'], {
        cwd: SERVER_DIR,
        env: { ...process.env, ...env, PORT: String(port) },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        await waitForHealth(baseUrl, child, logPath);
    } catch (error) {
        await stopGroup(child);
        throw error;
    }
    return { baseUrl, stop: () => stopGroup(child) };
}
