import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { shopApi } from '../api/client';
import {
    clearActingSession,
    readActingSession,
    saveActingSession,
    type ActingSessionData,
} from '../api/actingToken';
import {
    ExchangeActingTicketDocument,
    FinishActingSessionDocument,
} from '../api/generated/graphql';

export const useActingStore = defineStore('acting', () => {
    const session = ref<ActingSessionData | null>(readActingSession());
    const isActing = computed(() => session.value !== null);

    async function exchange(ticket: string): Promise<void> {
        clearActingSession();
        const { exchangeActingTicket: result } = await shopApi(ExchangeActingTicketDocument, {
            ticket,
        });
        const data = {
            token: result.token,
            expiresAt: result.expiresAt,
            administratorName: result.administratorName,
        };
        saveActingSession(data);
        session.value = data;
    }

    // The local token is dropped even when the server call fails, so the tab never stays stuck.
    async function finish(): Promise<void> {
        try {
            await shopApi(FinishActingSessionDocument);
        } finally {
            clearActingSession();
            session.value = null;
        }
    }

    return { session, isActing, exchange, finish };
});
