import { randomBytes } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';
import type { TestProject } from 'vitest/node';

import { runAccessSeed, SUPERADMIN } from '../seed/run-seed';
import type { SeedIds } from '../seed/seed-ids';
import { createVhost, deleteVhost } from './rabbit-vhost';
import { startPdfWorker, startServer } from './server-process';
import { createDatabase, dropDatabase, testDbConnection } from './test-database';

declare module 'vitest' {
    export interface ProvidedContext {
        accessBaseUrl: string;
        accessSeed: SeedIds;
    }
}

const LOG_DIR = resolve(__dirname, '../../../../.access-test');

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
    const name = `mivend_access_${Date.now()}_${process.pid}`;
    const importToken = randomBytes(24).toString('hex');
    const db = testDbConnection();
    mkdirSync(LOG_DIR, { recursive: true });
    await createDatabase(name);
    const rabbitUrl = await createVhost(name);
    const pdfDir = resolve(LOG_DIR, `pdfs-${name}`);
    let stop = async (): Promise<void> => {};
    let stopWorker = async (): Promise<void> => {};
    const teardown = async (): Promise<void> => {
        await stopWorker();
        await stop();
        await deleteVhost(name);
        await dropDatabase(name);
        rmSync(pdfDir, { recursive: true, force: true });
    };
    try {
        const env = {
            NODE_ENV: 'test',
            VENDURE_DISABLE_TELEMETRY: 'true',
            INSTANCE_TYPE: 'central',
            INSTANCE_ID: 'access-test',
            INSTANCE_NUMBER_CODE: '900',
            BOOTSTRAP_BRANCH_NAMES: 'Default',
            DB_HOST: db.host,
            DB_PORT: String(db.port),
            DB_USERNAME: db.user,
            DB_PASSWORD: db.password,
            DB_NAME: name,
            RABBITMQ_URL: rabbitUrl,
            SUPERADMIN_USERNAME: SUPERADMIN.username,
            SUPERADMIN_PASSWORD: SUPERADMIN.password,
            COOKIE_SECRET: randomBytes(16).toString('hex'),
            ERP_IMPORT_ENABLED: 'true',
            ERP_IMPORT_TOKEN: importToken,
            INTEGRATION_KAFKA_ENABLED: 'false',
            ERP_CALLBACK_ENABLED: 'false',
            EMAIL_DEV_MAILBOX_ENABLED: 'false',
            API_DOCS_ENABLED: 'false',
            // The external backend connects lazily, so search needs no running service here.
            SEARCH_BACKEND: 'external',
            SEARCH_SERVICE_URL: 'http://127.0.0.1:9',
            SEARCH_SERVICE_API_KEY: 'access-test',
            S3_ENDPOINT: '',
            DOCUMENT_PDF_DIR: pdfDir,
        };
        const server = await startServer(env, resolve(LOG_DIR, 'server.log'));
        stop = server.stop;
        stopWorker = startPdfWorker(env, resolve(LOG_DIR, 'worker.log'));
        project.provide('accessBaseUrl', server.baseUrl);
        project.provide('accessSeed', await runAccessSeed(server.baseUrl, importToken));
    } catch (error) {
        await teardown();
        throw error;
    }
    return teardown;
}
