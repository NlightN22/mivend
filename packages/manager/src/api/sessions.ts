import { adminApi } from './client';
import {
    EndAllSessionsDocument,
    EndSessionDocument,
    MySessionsDocument,
    MySignInSettingsDocument,
    SetNewDeviceEmailDocument,
    type MySessionsQuery,
} from './generated/graphql';

export type SessionSummary = MySessionsQuery['mySessions'][number];

export async function fetchMySessions(): Promise<SessionSummary[]> {
    const result = await adminApi(MySessionsDocument);
    return result.mySessions;
}

export async function endSession(id: string): Promise<boolean> {
    const result = await adminApi(EndSessionDocument, { id });
    return result.endSession;
}

export async function endAllSessions(): Promise<boolean> {
    const result = await adminApi(EndAllSessionsDocument);
    return result.endAllSessions;
}

export async function fetchNewDeviceEmail(): Promise<boolean> {
    const result = await adminApi(MySignInSettingsDocument);
    return result.mySignInSettings.newDeviceEmail;
}

export async function setNewDeviceEmail(enabled: boolean): Promise<boolean> {
    const result = await adminApi(SetNewDeviceEmailDocument, { enabled });
    return result.setNewDeviceEmail.newDeviceEmail;
}
