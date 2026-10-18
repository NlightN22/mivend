import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadContourEnv } from './contour-env';
import { updateRun } from './run-state';

const REPO_ROOT = path.join(__dirname, '../../..');
const LOG_FILE = path.join(__dirname, '../test-results/integration/contour-restart.log');
const READY_TIMEOUT_MS = 8 * 60_000;
const SUITE_ENV_KEYS = [
    'SERVER_URL',
    'STOREFRONT_URL',
    'MANAGER_URL',
    'SUPERADMIN_USERNAME',
    'SUPERADMIN_PASSWORD',
];
export const UNREACHABLE_SCHEMA_REGISTRY = {
    INTEGRATION_SCHEMA_REGISTRY_URL: 'http://127.0.0.1:9',
};

async function isUp(url: string): Promise<boolean> {
    try {
        return (await fetch(url, { signal: AbortSignal.timeout(5000) })).ok;
    } catch {
        return false;
    }
}

async function waitUntilReady(): Promise<void> {
    const { serverUrl, storefrontUrl } = loadContourEnv();
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if ((await isUp(`${serverUrl}/health`)) && (await isUp(storefrontUrl))) return;
        await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error(`staging-integration contour not ready after restart, see ${LOG_FILE}`);
}

async function waitUntilDown(): Promise<void> {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline && (await isUp(`${loadContourEnv().serverUrl}/health`))) {
        await new Promise(r => setTimeout(r, 2000));
    }
}

// Same entry point as a person uses; the make target kills the running contour first.
export async function restartContour(overrides: Record<string, string> = {}): Promise<void> {
    const env: NodeJS.ProcessEnv = { ...process.env, ...overrides };
    for (const key of SUITE_ENV_KEYS) delete env[key];
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const log = fs.openSync(LOG_FILE, 'a');
    updateRun({ contourBroken: Object.keys(overrides).length > 0 });
    const child = spawn('make', ['dev-staging-integration'], {
        cwd: REPO_ROOT,
        env,
        detached: true,
        stdio: ['ignore', log, log],
    });
    child.unref();
    await waitUntilDown();
    await waitUntilReady();
}
