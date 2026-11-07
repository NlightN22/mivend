import { adminApi } from './client';
import { StartActingSessionDocument } from './generated/graphql';

export function actingStorefrontUrl(storefrontUrl: string, ticket: string): string {
    return `${storefrontUrl.replace(/\/+$/, '')}/acting#ticket=${encodeURIComponent(ticket)}`;
}

export async function startActingSession(counterpartyId: string): Promise<string> {
    const { startActingSession: started } = await adminApi(StartActingSessionDocument, {
        counterpartyId,
        tradingPointId: null,
    });
    return actingStorefrontUrl(started.storefrontUrl, started.ticket);
}
