import { shopApi } from './client';
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
    const result = await shopApi(MySessionsDocument);
    return result.mySessions;
}

export async function endSession(id: string): Promise<boolean> {
    const result = await shopApi(EndSessionDocument, { id });
    return result.endSession;
}

export async function endAllSessions(): Promise<boolean> {
    const result = await shopApi(EndAllSessionsDocument);
    return result.endAllSessions;
}

export async function fetchNewDeviceEmail(): Promise<boolean> {
    const result = await shopApi(MySignInSettingsDocument);
    return result.mySignInSettings.newDeviceEmail;
}

export async function setNewDeviceEmail(enabled: boolean): Promise<boolean> {
    const result = await shopApi(SetNewDeviceEmailDocument, { enabled });
    return result.setNewDeviceEmail.newDeviceEmail;
}
