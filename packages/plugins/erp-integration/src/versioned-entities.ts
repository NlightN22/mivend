import { EventBus } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import {
    CounterpartyVersionedEvent,
    TradingPointVersionedEvent,
} from '@mivend/plugin-counterparty';
import { subscribeAndLog } from 'shared';

import {
    COUNTERPARTY_COMMANDS_TOPIC,
    encodeCounterpartyCommand,
} from './counterparty-command.codec';
import {
    encodeTradingPointCommand,
    TRADING_POINT_COMMANDS_TOPIC,
} from './trading-point-command.codec';

export type VersionedEventType = 'trading-point.changed' | 'counterparty.changed';

export interface VersionedChange {
    ctx: RequestContext;
    key: string;
    version: number;
}

export interface VersionedEntitySpec {
    // Where the entity's own version lives, for the reconciler's "current version has no outbox row" sweep.
    table: string;
    keyColumn: string;
    topic: string;
    encode: (payload: Record<string, unknown>) => Uint8Array;
    // Message key on the topic and the payload field that carries it.
    keyField: string;
    subscribe: (
        eventBus: EventBus,
        handler: (change: VersionedChange) => Promise<void>,
        loggerCtx: string,
    ) => void;
}

// One entry per entity mivend owns and sends whole to the ERP. A new type breaks the Record until registered.
export const VERSIONED_ENTITIES: Record<VersionedEventType, VersionedEntitySpec> = {
    'trading-point.changed': {
        table: 'trading_point',
        keyColumn: 'uuid',
        topic: TRADING_POINT_COMMANDS_TOPIC,
        encode: encodeTradingPointCommand,
        keyField: 'uuid',
        subscribe: (eventBus, handler, loggerCtx) =>
            subscribeAndLog(
                eventBus,
                TradingPointVersionedEvent,
                e => handler({ ctx: e.ctx, key: e.tradingPointUuid, version: e.version }),
                loggerCtx,
            ),
    },
    'counterparty.changed': {
        table: 'counterparty',
        keyColumn: 'erpId',
        topic: COUNTERPARTY_COMMANDS_TOPIC,
        encode: encodeCounterpartyCommand,
        keyField: 'erpId',
        subscribe: (eventBus, handler, loggerCtx) =>
            subscribeAndLog(
                eventBus,
                CounterpartyVersionedEvent,
                e => handler({ ctx: e.ctx, key: e.erpId, version: e.version }),
                loggerCtx,
            ),
    },
};

export const VERSIONED_EVENT_TYPES = Object.keys(VERSIONED_ENTITIES) as VersionedEventType[];

export function isVersionedEventType(eventType: string): eventType is VersionedEventType {
    return eventType in VERSIONED_ENTITIES;
}
