import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export const REPO_ROOT = resolve(__dirname, '../../../../..');
export const STACK_DIR = resolve(REPO_ROOT, 'apps/server/.e2e-stack');
export const E2E_PREFIX = 'mivend_e2e_';
// Clear of make dev (3000, 5173/5174) and staging-integration (3010, 5183-5185).
export const E2E_PORTS = { server: 3020, storefront: 5193, manager: 5194 };

function parseEnvFile(path: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const match = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
        if (match) env[match[1]] = match[2].trim();
    }
    return env;
}

// The local contour's settings, so the e2e server behaves like make dev on its own database.
export function localContourEnv(): Record<string, string> {
    const own = resolve(REPO_ROOT, 'apps/server/.env.central');
    return parseEnvFile(existsSync(own) ? own : `${own}.example`);
}

export function serverEnv(
    base: Record<string, string>,
    name: string,
    rabbitUrl: string,
): Record<string, string> {
    return {
        ...base,
        PORT: String(E2E_PORTS.server),
        DB_NAME: name,
        RABBITMQ_URL: rabbitUrl,
        ELASTICSEARCH_INDEX_PREFIX: `${name}-`,
        DOCUMENT_PDF_DIR: resolve(STACK_DIR, `pdfs-${name}`),
    };
}

export function testRunEnv(base: Record<string, string>, name: string): Record<string, string> {
    return {
        SERVER_URL: `http://localhost:${E2E_PORTS.server}`,
        STOREFRONT_URL: `http://localhost:${E2E_PORTS.storefront}`,
        MANAGER_URL: `http://localhost:${E2E_PORTS.manager}`,
        ERP_IMPORT_TOKEN: base.ERP_IMPORT_TOKEN,
        ERP_CALLBACK_API_KEY: base.ERP_CALLBACK_API_KEY,
        SUPERADMIN_USERNAME: base.SUPERADMIN_USERNAME,
        SUPERADMIN_PASSWORD: base.SUPERADMIN_PASSWORD,
        E2E_DB_NAME: name,
    };
}
