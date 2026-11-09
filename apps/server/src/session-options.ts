export interface SessionOptions {
    sessionDuration: string;
    maxActiveSessionsCustomer: number;
    maxActiveSessionsStaff: number;
    knownDeviceRetentionDays: number;
    dailyReset: { enabled: boolean; hour: number };
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
    const raw = env[name];
    const value = raw ? Number(raw) : fallback;
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer, got "${raw}"`);
    }
    return value;
}

function resetHour(env: NodeJS.ProcessEnv): number {
    const raw = env.SESSION_DAILY_RESET_HOUR;
    const value = raw ? Number(raw) : 3;
    if (!Number.isInteger(value) || value < 0 || value > 23) {
        throw new Error(`SESSION_DAILY_RESET_HOUR must be an integer from 0 to 23, got "${raw}"`);
    }
    return value;
}

function flag(env: NodeJS.ProcessEnv, name: string): boolean {
    const raw = (env[name] ?? '').trim().toLowerCase();
    if (['', 'false', '0'].includes(raw)) return false;
    if (['true', '1'].includes(raw)) return true;
    throw new Error(`${name} must be true or false, got "${env[name]}"`);
}

export function sessionOptionsFromEnv(env: NodeJS.ProcessEnv): SessionOptions {
    if (env.SESSION_MAX_ACTIVE_PER_USER !== undefined) {
        throw new Error(
            'SESSION_MAX_ACTIVE_PER_USER was removed: set SESSION_MAX_ACTIVE_CUSTOMER and SESSION_MAX_ACTIVE_STAFF instead',
        );
    }
    if (env.SESSION_DAILY_RESET_TIME_ZONE !== undefined) {
        throw new Error(
            'SESSION_DAILY_RESET_TIME_ZONE was removed: the daily reset uses the process time zone, set TZ instead',
        );
    }
    return {
        sessionDuration: env.SESSION_DURATION || '30d',
        maxActiveSessionsCustomer: positiveInt(env, 'SESSION_MAX_ACTIVE_CUSTOMER', 2),
        maxActiveSessionsStaff: positiveInt(env, 'SESSION_MAX_ACTIVE_STAFF', 3),
        knownDeviceRetentionDays: positiveInt(env, 'SESSION_KNOWN_DEVICE_RETENTION_DAYS', 400),
        dailyReset: {
            enabled: flag(env, 'SESSION_DAILY_RESET_ENABLED'),
            hour: resetHour(env),
        },
    };
}
