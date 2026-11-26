import { randomBytes } from 'crypto';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { startEchoOrderMetricsServer } from '@mivend/plugin-analytics';
import type { TestProject } from 'vitest/node';

import { runAccessSeed, SUPERADMIN } from '../seed/run-seed';
import type { SeedIds } from '../seed/seed-ids';
import { createVhost, deleteVhost } from './rabbit-vhost';
import { startPdfWorker, startServer } from './server-process';
import { ACCESS_PREFIX, sweepStaleRuns } from './stale-sweep';
import { createDatabase, dropDatabase, testDbConnection } from './test-database';

declare module 'vitest' {
    export interface ProvidedContext {
        accessBaseUrl: string;
        accessSeed: SeedIds;
        accessServerEnv: Record<string, string>;
        accessDatabase: string;
    }
}

const LOG_DIR = resolve(__dirname, '../../../../.access-test');

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
    await sweepStaleRuns();
    const name = `${ACCESS_PREFIX}${Date.now()}_${process.pid}`;
    const importToken = randomBytes(24).toString('hex');
    const db = testDbConnection();
    mkdirSync(LOG_DIR, { recursive: true });
    await createDatabase(name);
    const rabbitUrl = await createVhost(name);
    const pdfDir = resolve(LOG_DIR, `pdfs-${name}`);
    let stop = async (): Promise<void> => {};
    let stopWorker = async (): Promise<void> => {};
    let stopAnalytics = async (): Promise<void> => {};
    const teardown = async (): Promise<void> => {
        const errors: unknown[] = [];
        const steps = [
            stopAnalytics,
            stopWorker,
            stop,
            () => deleteVhost(name),
            () => dropDatabase(name),
            async () => rmSync(pdfDir, { recursive: true, force: true }),
        ];
        for (const step of steps) {
            try {
                await step();
            } catch (error) {
                errors.push(error);
            }
        }
        if (errors.length > 0) throw errors[0];
    };
    try {
        const analyticsKey = randomBytes(12).toString('hex');
        const analyticsKeyFile = resolve(LOG_DIR, `analytics-${name}.key`);
        writeFileSync(analyticsKeyFile, analyticsKey);
        const analytics = await startEchoOrderMetricsServer(analyticsKey);
        stopAnalytics = async () => {
            await analytics.stop();
            rmSync(analyticsKeyFile, { force: true });
        };
        const env = {
            NODE_ENV: 'test',
            ONLINE_PAYMENT_STUB_ENABLED: 'true',
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
            SEARCH_SERVICE_API_KEY_PUBLIC: 'access-test',
            SEARCH_SERVICE_API_KEY_STOREFRONT: 'access-test',
            SEARCH_SERVICE_API_KEY_MANAGER: 'access-test',
            S3_ENDPOINT: '',
            // Only builds the acting hand-off link; no storefront is contacted.
            STOREFRONT_PUBLIC_URL: 'http://127.0.0.1:9',
            DOCUMENT_PDF_DIR: pdfDir,
            LEGAL_OPERATOR_NAME: 'Access Operator',
            LEGAL_CONTACT_EMAIL: 'legal@access.test',
            GEO_PROVIDERS: 'open',
            // The analytics service is a test double that echoes what the server asked for.
            ANALYTICS_GRPC_ADDRESS: analytics.address,
            ANALYTICS_GRPC_KEY_FILE: analyticsKeyFile,
            ANALYTICS_GRPC_INSECURE: 'true',
        };
        const server = await startServer(env, resolve(LOG_DIR, 'server.log'));
        stop = server.stop;
        stopWorker = startPdfWorker(env, resolve(LOG_DIR, 'worker.log'));
        project.provide('accessBaseUrl', server.baseUrl);
        project.provide('accessServerEnv', env);
        project.provide('accessDatabase', name);
        project.provide('accessSeed', await runAccessSeed(server.baseUrl, importToken, name));
    } catch (error) {
        await teardown();
        throw error;
    }
    return teardown;
}
