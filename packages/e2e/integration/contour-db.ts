import { execFileSync } from 'child_process';
import { loadContourEnv } from './contour-env';

const CONTAINER = 'docker-postgres-central-1';
const DB_NAME = loadContourEnv().dbName;

// Read-only by construction: the session is opened with default_transaction_read_only.
export function select<T>(query: string): T[] {
    const wrapped = `SET default_transaction_read_only = on; SELECT coalesce(json_agg(t), '[]'::json) FROM (${query}) t;`;
    const out = execFileSync(
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
        { input: wrapped, encoding: 'utf8' },
    );
    return JSON.parse(out.trim().replace(/^SET\n/, '')) as T[];
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
