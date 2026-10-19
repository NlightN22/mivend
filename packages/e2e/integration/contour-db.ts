import { execFileSync } from 'child_process';
import { loadContourEnv } from './contour-env';

const CONTAINER = process.env.E2E_INTEGRATION_PG_CONTAINER ?? 'docker-postgres-central-1';
const DB_NAME = loadContourEnv().dbName;

// Read-only by construction: the session is opened with default_transaction_read_only.
export function select<T>(query: string): T[] {
    const wrapped = `SET default_transaction_read_only = on; SELECT coalesce(json_agg(t), '[]'::json) FROM (${query}) t;`;
    const out = runPsql(wrapped);
    return JSON.parse(out.trim().replace(/^SET\n/, '')) as T[];
}

function runPsql(input: string): string {
    try {
        return execFileSync(
            'docker',
            [
                'exec',
                '-i',
                CONTAINER,
                'psql',
                '-U',
                'postgres',
                '-d',
                DB_NAME,
                '-At',
                '-v',
                'ON_ERROR_STOP=1',
                '-f',
                '-',
            ],
            { input, encoding: 'utf8' },
        );
    } catch (error) {
        throw new Error(
            `psql in container ${CONTAINER} failed (set E2E_INTEGRATION_PG_CONTAINER if it is named differently): ${String(error)}`,
        );
    }
}

export function literal(value: string): string {
    if (!/^[A-Za-z0-9.-]+$/.test(value)) throw new Error(`Unsafe SQL literal: ${value}`);
    return `'${value}'`;
}

export async function waitFor<T>(
    read: () => T | undefined,
    timeoutMs: number,
    intervalMs = 3000,
): Promise<T | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = read();
        if (value !== undefined) return value;
        if (Date.now() >= deadline) return undefined;
        await new Promise(r => setTimeout(r, intervalMs));
    }
}
