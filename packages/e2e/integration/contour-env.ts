import * as fs from 'fs';
import * as path from 'path';

const ENV_FILE = path.join(__dirname, '../../../apps/server/.env.central.staging-integration');

function parseEnvFile(): Record<string, string> {
    if (!fs.existsSync(ENV_FILE)) {
        throw new Error(`make e2e-integration needs ${ENV_FILE} (see docs/environments.md)`);
    }
    const values: Record<string, string> = {};
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
        const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
    return values;
}

function required(values: Record<string, string>, key: string): string {
    const value = values[key];
    if (!value) throw new Error(`${key} is missing in the staging-integration env file`);
    return value;
}

export function envValue(key: string): string | undefined {
    return parseEnvFile()[key];
}

export interface ContourEnv {
    serverUrl: string;
    storefrontUrl: string;
    managerUrl: string;
    dbName: string;
    customer: { email: string; password: string };
    superadmin: { username: string; password: string };
    manager: { username: string; password: string } | null;
}

export function loadContourEnv(): ContourEnv {
    const values = parseEnvFile();
    const managerLogin = values.STAGING_TEST_MANAGER_USERNAME;
    const managerPassword = values.STAGING_TEST_MANAGER_PASSWORD;
    return {
        serverUrl: `http://localhost:${required(values, 'PORT')}`,
        storefrontUrl: 'http://localhost:5183',
        managerUrl: 'http://localhost:5184',
        dbName: required(values, 'DB_NAME'),
        customer: {
            email: required(values, 'STAGING_TEST_CUSTOMER_EMAIL'),
            password: required(values, 'STAGING_TEST_CUSTOMER_PASSWORD'),
        },
        superadmin: {
            username: required(values, 'SUPERADMIN_USERNAME'),
            password: required(values, 'SUPERADMIN_PASSWORD'),
        },
        manager:
            managerLogin && managerPassword
                ? { username: managerLogin, password: managerPassword }
                : null,
    };
}
