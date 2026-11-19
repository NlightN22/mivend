import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { deleteVhost, listVhosts } from '../access/harness/rabbit-vhost';
import {
    dropDatabase,
    listDatabases,
    readDatabaseComment,
    setDatabaseComment,
} from '../access/harness/test-database';
import { blockIndexWrites, deleteIndices } from './search-indices';
import { REPO_ROOT } from './stack-env';

export const TEMPLATE_PREFIX = 'mivend_e2etpl_';
const TTL_MS = Number(process.env.E2E_TEMPLATE_TTL_HOURS ?? 48) * 3_600_000;
const KEEP = 3;

// Everything that decides what the seeded database holds; the portals and the specs do not.
const KEY_PATHS = [
    'apps/server/src',
    'packages/plugins',
    ':(exclude,glob)**/__tests__/**',
    ':(exclude,glob)**/dist/**',
    ':(exclude,glob)**/*.test.ts',
    'packages/shared/src',
    'packages/e2e/fixtures',
    'packages/e2e/helpers',
    'packages/e2e/stack-data.ts',
    'packages/e2e/seed-stack-data.ts',
    'infrastructure/scripts/seed-erp.mjs',
    'infrastructure/scripts/seed-balance-demo.mjs',
    'infrastructure/scripts/seed-statement-kinds.mjs',
    'infrastructure/scripts/seed-tier-showcase.mjs',
    'pnpm-lock.yaml',
];

export interface TemplateMeta {
    createdAt: number;
    order: unknown;
}

export function templateName(): string {
    const files = execFileSync(
        'git',
        ['ls-files', '-co', '--exclude-standard', '-z', '--', ...KEY_PATHS],
        { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 },
    )
        .toString()
        .split('\0')
        .filter(Boolean)
        .sort();
    const hash = createHash('sha1');
    for (const file of files) {
        try {
            hash.update(file).update(readFileSync(resolve(REPO_ROOT, file)));
        } catch {
            // listed but deleted in the working tree
        }
    }
    return `${TEMPLATE_PREFIX}${hash.digest('hex').slice(0, 16)}`;
}

async function readMeta(name: string): Promise<TemplateMeta | undefined> {
    const comment = await readDatabaseComment(name);
    if (!comment) return undefined;
    try {
        return JSON.parse(comment) as TemplateMeta;
    } catch {
        return undefined;
    }
}

export async function findTemplate(name: string): Promise<TemplateMeta | undefined> {
    const meta = await readMeta(name);
    return meta && Date.now() - meta.createdAt < TTL_MS ? meta : undefined;
}

async function dropTemplate(base: Record<string, string>, name: string): Promise<void> {
    await dropDatabase(name);
    await deleteIndices(base, `${name}-`);
}

// Runs hold the e2e lock: a template without metadata, or a build vhost, belongs to a killed build.
export async function sweepTemplates(base: Record<string, string>, keep: string): Promise<void> {
    for (const name of (await listVhosts()).filter(n => n.startsWith(TEMPLATE_PREFIX)))
        await deleteVhost(name);
    const fresh: [string, number][] = [];
    const stale: string[] = [];
    for (const name of await listDatabases(TEMPLATE_PREFIX)) {
        const meta = await readMeta(name);
        if (meta && Date.now() - meta.createdAt < TTL_MS) fresh.push([name, meta.createdAt]);
        else stale.push(name);
    }
    fresh.sort((a, b) => b[1] - a[1]);
    for (const [name] of fresh.filter(([n], i) => n !== keep && i >= KEEP)) stale.push(name);
    for (const name of stale) await dropTemplate(base, name);
}

export async function publishTemplate(
    base: Record<string, string>,
    name: string,
    order: unknown,
): Promise<void> {
    await blockIndexWrites(base, `${name}-`);
    await setDatabaseComment(name, JSON.stringify({ createdAt: Date.now(), order }));
}
