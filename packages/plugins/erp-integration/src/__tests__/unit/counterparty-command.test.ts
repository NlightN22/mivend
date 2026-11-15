import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fromBinary } from '@bufbuild/protobuf';
import { CounterpartyCommandSchema } from '@nlightn22/event-contracts';
import type { CounterpartySnapshot as SnapshotMessage } from '@nlightn22/event-contracts';
import type { RequestContext } from '@vendure/core';
import type { CounterpartySnapshot } from '@mivend/plugin-counterparty';

import { CounterpartyCommandBuilder } from '../../counterparty-command.builder';
import {
    COUNTERPARTY_COMMANDS_TOPIC,
    encodeCounterpartyCommand,
} from '../../counterparty-command.codec';
import { toCounterpartyCommandPayload } from '../../counterparty-command.payload';

const ctx = {} as RequestContext;
const snapshot = {
    counterparty: {
        erpId: 'cp-erp-1',
        version: 5,
        shortName: 'Acme',
        fullName: 'Acme Trading',
        inn: '7700000001',
        kpp: null,
        legalAddress: 'Test Street 1',
        phone: '+70000000001',
        officialEmail: 'a@example.com',
        erpGroupLabel: 'Group',
        creditLimit: 1000,
    },
    managerId: 'user-1',
    managerIds: ['user-1', 'user-2'],
    unlinkedAdministratorIds: [],
    contactInfos: [
        { type: 'phone', label: 'Main', isPrimary: true, value: '+70000000001' },
        { type: 'email', label: null, isPrimary: false, value: 'a@example.com' },
        { type: 'other', label: null, isPrimary: false, value: 'skipped' },
    ],
} as unknown as CounterpartySnapshot;

describe('counterparty command payload', () => {
    it('maps the portal-owned record and round-trips through the protobuf contract', () => {
        const payload = toCounterpartyCommandPayload(snapshot, 'ev-1', new Date(0));
        const envelope = fromBinary(CounterpartyCommandSchema, encodeCounterpartyCommand(payload));

        expect(envelope).toMatchObject({ eventId: 'ev-1', erpId: 'cp-erp-1', version: 5n });
        expect(envelope.command.case).toBe('counterpartySnapshot');
        const record = envelope.command.value as SnapshotMessage;
        expect(record).toMatchObject({
            name: 'Acme',
            fullName: 'Acme Trading',
            inn: '7700000001',
            legalAddress: 'Test Street 1',
            phone: '+70000000001',
            officialEmail: 'a@example.com',
            erpGroupLabel: 'Group',
            managerId: 'user-1',
            managerIds: ['user-1', 'user-2'],
        });
        expect(record.kpp).toBeUndefined();
        expect(record.contactInfos.map(c => c.presentation)).toEqual([
            '+70000000001',
            'a@example.com',
        ]);
    });

    it('sends only portal-owned fields, never credit or other ERP-owned data', () => {
        const payload = toCounterpartyCommandPayload(snapshot, 'ev-1', new Date(0));
        expect(JSON.stringify(payload)).not.toContain('creditLimit');
    });

    it('leaves the main manager unset when the owner has no ERP link', () => {
        const payload = toCounterpartyCommandPayload(
            { ...snapshot, managerId: null, managerIds: ['user-2'] },
            'ev-1',
            new Date(0),
        );
        const record = fromBinary(CounterpartyCommandSchema, encodeCounterpartyCommand(payload))
            .command.value as SnapshotMessage;
        expect(record.managerId).toBeUndefined();
        expect(record.managerIds).toEqual(['user-2']);
    });

    it('refuses a field outside the contract and publishes to the contract topic', () => {
        expect(() => encodeCounterpartyCommand({ erpId: 'e', unknownField: 1 })).toThrow();
        expect(COUNTERPARTY_COMMANDS_TOPIC).toBe('mivend.counterparty.commands.v1');
    });
});

describe('CounterpartyCommandBuilder', () => {
    const load = vi.fn();
    const gateway = { hasEntryAtOrAbove: vi.fn(), skipOlderWaiting: vi.fn() };
    let builder: CounterpartyCommandBuilder;

    beforeEach(() => {
        vi.clearAllMocks();
        load.mockResolvedValue(snapshot);
        gateway.hasEntryAtOrAbove.mockResolvedValue(false);
        builder = new CounterpartyCommandBuilder({ load } as never, gateway as never);
    });

    it('sends the current record at its current version and supersedes older waiting rows', async () => {
        const result = await builder.build(ctx, 'cp-erp-1');
        expect(result.kind).toBe('send');
        if (result.kind !== 'send') return;
        expect(result.events).toHaveLength(1);
        expect(result.events[0].payload).toMatchObject({ erpId: 'cp-erp-1', version: '5' });
        expect(gateway.skipOlderWaiting).toHaveBeenCalledWith(
            ctx,
            'counterparty.changed',
            'cp-erp-1',
            5,
        );
    });

    it('is a no-op for a version already pending or published (same version twice, one effect)', async () => {
        gateway.hasEntryAtOrAbove.mockResolvedValue(true);
        expect((await builder.build(ctx, 'cp-erp-1')).kind).toBe('noop');
        expect(gateway.skipOlderWaiting).not.toHaveBeenCalled();
    });

    it('records a skip with a reason when the counterparty no longer exists', async () => {
        load.mockResolvedValue(null);
        expect(await builder.build(ctx, 'gone')).toMatchObject({
            kind: 'skip',
            reason: expect.stringContaining('not found'),
        });
    });
});
