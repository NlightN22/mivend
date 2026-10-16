export interface SessionOptions {
    sessionDuration: string;
    maxActiveSessionsPerUser: number;
}

export function sessionOptionsFromEnv(env: NodeJS.ProcessEnv): SessionOptions {
    const maxRaw = env.SESSION_MAX_ACTIVE_PER_USER;
    const maxActiveSessionsPerUser = maxRaw ? Number(maxRaw) : 20;
    if (!Number.isInteger(maxActiveSessionsPerUser) || maxActiveSessionsPerUser < 1) {
        throw new Error(`SESSION_MAX_ACTIVE_PER_USER must be a positive integer, got "${maxRaw}"`);
    }
    return { sessionDuration: env.SESSION_DURATION || '30d', maxActiveSessionsPerUser };
}
