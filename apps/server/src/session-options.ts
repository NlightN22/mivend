export interface SessionOptions {
    sessionDuration: string;
    maxActiveSessionsCustomer: number;
    maxActiveSessionsStaff: number;
    dailyReset: { enabled: boolean; hour: number; timeZone: string };
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

function resetTimeZone(env: NodeJS.ProcessEnv): string {
    const timeZone = env.SESSION_DAILY_RESET_TIME_ZONE || 'UTC';
    try {
        new Intl.DateTimeFormat('en-CA', { timeZone });
    } catch {
        throw new Error(
            `SESSION_DAILY_RESET_TIME_ZONE must be an IANA time zone name, got "${timeZone}"`,
        );
    }
    return timeZone;
}

export function sessionOptionsFromEnv(env: NodeJS.ProcessEnv): SessionOptions {
    return {
        sessionDuration: env.SESSION_DURATION || '30d',
        maxActiveSessionsCustomer: positiveInt(env, 'SESSION_MAX_ACTIVE_CUSTOMER', 2),
        maxActiveSessionsStaff: positiveInt(env, 'SESSION_MAX_ACTIVE_STAFF', 3),
        dailyReset: {
            enabled: env.SESSION_DAILY_RESET_ENABLED === 'true',
            hour: resetHour(env),
            timeZone: resetTimeZone(env),
        },
    };
}
