import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fromBinary } from '@bufbuild/protobuf';
import { TradingPointCommandSchema } from '@nlightn22/event-contracts';
import type { TradingPointSnapshot } from '@nlightn22/event-contracts';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { Counterparty, TradingPoint } from '@mivend/plugin-counterparty';

import { readFileSync } from 'fs';
import { version as installedContracts } from '@nlightn22/event-contracts/package.json';
import { compareContractVersions } from '../../contract-version-drift';
import { TradingPointCommandBuilder } from '../../trading-point-command.builder';
import {
    encodeTradingPointCommand,
    TRADING_POINT_COMMANDS_TOPIC,
} from '../../trading-point-command.codec';
import { toTradingPointCommandPayload } from '../../trading-point-command.payload';

const ctx = {} as RequestContext;
const basePoint = {
    uuid: '2f1c0c52-8f43-4b6e-9a43-0d6a6ab5c001',
    version: 3,
    erpId: 'erp-point-1',
    counterpartyId: 'cp-1',
    name: 'Point A',
    address: 'Test Street 1',
    latitude: 55.5,
    longitude: 37.5,
    workingHours: '9-18',
    deliveryComment: null,
    isActive: true,
    customerStatus: 'active',
    contacts: [
        { name: 'Ivan', phone: '+70000000001', email: 'a@example.com', isPrimary: true },
        { name: 'Petr', phone: null, email: null, isPrimary: false },
    ],
} as unknown as TradingPoint;

describe('trading point command payload', () => {
    it('maps the full record and round-trips through the protobuf contract', () => {
        const payload = toTradingPointCommandPayload(basePoint, 'erp-cp-1', 'ev-1', new Date(0));
        const envelope = fromBinary(TradingPointCommandSchema, encodeTradingPointCommand(payload));

        expect(envelope).toMatchObject({
            eventId: 'ev-1',
            uuid: basePoint.uuid,
            version: 3n,
            erpId: 'erp-point-1',
        });
        expect(envelope.command.case).toBe('tradingPointSnapshot');
        const decoded = envelope.command.value as TradingPointSnapshot;
        expect(decoded).toMatchObject({
            name: 'Point A',
            counterpartyId: 'erp-cp-1',
            address: 'Test Street 1',
            latitude: 55.5,
            longitude: 37.5,
            contactPhone: '+70000000001',
            workingHours: '9-18',
            isActive: true,
            isHidden: false,
        });
        expect(decoded.deliveryComment).toBeUndefined();
        expect(decoded.contactInfos.map(c => c.presentation)).toEqual([
            '+70000000001',
            'a@example.com',
        ]);
    });

    it('sends a dictionary contact kind, never the contact person name', () => {
        const payload = toTradingPointCommandPayload(basePoint, 'erp-cp-1', 'ev-1', new Date(0));
        const infos = (payload.tradingPointSnapshot as { contactInfos: { kindName: string }[] })
            .contactInfos;

        expect(infos.map(c => c.kindName)).toEqual([
            'Телефон для оповещения торговой точки',
            'Адрес электронной почты',
        ]);
        expect(JSON.stringify(infos)).not.toContain('Ivan');
    });

    it('leaves erp_id unset for a customer-added point and flags a hidden one', () => {
        const point = { ...basePoint, erpId: 'cust_abc', customerStatus: 'hidden' } as TradingPoint;
        const envelope = fromBinary(
            TradingPointCommandSchema,
            encodeTradingPointCommand(
                toTradingPointCommandPayload(point, 'erp-cp-1', 'e', new Date()),
            ),
        );
        expect(envelope.erpId).toBeUndefined();
        expect((envelope.command.value as TradingPointSnapshot).isHidden).toBe(true);
    });

    it('refuses a payload with a field outside the contract', () => {
        expect(() => encodeTradingPointCommand({ uuid: 'u', unknownField: 1 })).toThrow();
        expect(() =>
            encodeTradingPointCommand({ uuid: 'u', tradingPointSnapshot: { unknownField: 1 } }),
        ).toThrow();
    });
});

describe('TradingPointCommandBuilder', () => {
    const findPoint = vi.fn();
    const findCounterparty = vi.fn();
    const gateway = { hasEntryAtOrAbove: vi.fn(), skipOlderWaiting: vi.fn() };
    let builder: TradingPointCommandBuilder;

    beforeEach(() => {
        vi.clearAllMocks();
        findPoint.mockResolvedValue(basePoint);
        findCounterparty.mockResolvedValue({ erpId: 'erp-cp-1' });
        gateway.hasEntryAtOrAbove.mockResolvedValue(false);
        const connection = {
            getRepository: (_c: unknown, entity: unknown) => ({
                findOne: entity === TradingPoint ? findPoint : findCounterparty,
            }),
        } as unknown as TransactionalConnection;
        builder = new TradingPointCommandBuilder(connection, gateway as never);
        void Counterparty;
    });

    it('sends the current record at its current version and skips older waiting rows', async () => {
        const result = await builder.build(ctx, basePoint.uuid);

        expect(result.kind).toBe('send');
        if (result.kind !== 'send') return;
        expect(result.events).toHaveLength(1);
        expect(result.events[0].payload).toMatchObject({ uuid: basePoint.uuid, version: '3' });
        expect(gateway.skipOlderWaiting).toHaveBeenCalledWith(
            ctx,
            'trading-point.changed',
            basePoint.uuid,
            3,
        );
    });

    it('records a skip with a reason when the point no longer exists', async () => {
        findPoint.mockResolvedValue(null);
        const result = await builder.build(ctx, 'gone');
        expect(result).toMatchObject({
            kind: 'skip',
            reason: expect.stringContaining('not found'),
        });
    });

    it('is a no-op for a version already pending or published', async () => {
        gateway.hasEntryAtOrAbove.mockResolvedValue(true);
        const result = await builder.build(ctx, basePoint.uuid);
        expect(result.kind).toBe('noop');
        expect(gateway.skipOlderWaiting).not.toHaveBeenCalled();
    });
});

describe('trading point contract pin', () => {
    it('publishes to the contract topic', () => {
        expect(TRADING_POINT_COMMANDS_TOPIC).toBe('mivend.trading-point.commands.v1');
    });

    it('requires a contracts package that ships the command (>=0.90.0)', () => {
        const pkg = JSON.parse(readFileSync(`${__dirname}/../../../package.json`, 'utf8')) as {
            dependencies: Record<string, string>;
        };
        expect(pkg.dependencies['@nlightn22/event-contracts']).toMatch(/^\^0\.(9\d|[1-9]\d{2,})\./);
        expect(compareContractVersions(installedContracts, '0.90.0').status).not.toBe('BEHIND');
    });
});
