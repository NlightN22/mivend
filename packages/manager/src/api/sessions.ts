import { adminApi } from './client';

export interface SessionSummary {
    id: string;
    userAgent: string | null;
    deviceLabel: string;
    createdAt: string;
    expires: string;
    current: boolean;
}

export async function fetchMySessions(): Promise<SessionSummary[]> {
    const result = await adminApi<{ mySessions: SessionSummary[] }>(
        `query MySessions { mySessions { id userAgent deviceLabel createdAt expires current } }`,
    );
    return result.mySessions;
}

export async function endSession(id: string): Promise<boolean> {
    const result = await adminApi<{ endSession: boolean }>(
        `mutation EndSession($id: ID!) { endSession(id: $id) }`,
        { id },
    );
    return result.endSession;
}

export async function endAllSessions(): Promise<boolean> {
    const result = await adminApi<{ endAllSessions: boolean }>(`mutation { endAllSessions }`);
    return result.endAllSessions;
}
