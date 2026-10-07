import { describe, expect, it } from 'vitest';

import { listContractStreams, streamNameFromSchemaExport } from '../../contract-streams';
import { IGNORED_CONTRACT_STREAMS } from '../../ignored-contract-streams';
import { ALL_INBOUND_STREAMS } from '../../types';

describe('streamNameFromSchemaExport', () => {
    it.each([
        ['CategoryChangedSchema', 'category'],
        ['CounterpartyCreditBalanceChangedSchema', 'counterparty-credit-balance'],
        ['OrderChangedSchema', 'order-changed'],
        ['OrderChangeResultSchema', 'order-change-result'],
        ['OrderRegistrationResultSchema', 'order-registration-result'],
    ])('%s -> %s', (exportName, stream) => {
        expect(streamNameFromSchemaExport(exportName)).toBe(stream);
    });

    it('skips nested and helper schemas', () => {
        expect(streamNameFromSchemaExport('ProtoReservedLineSchema')).toBeNull();
        expect(streamNameFromSchemaExport('OrderChangedLineSchema')).toBeNull();
        expect(streamNameFromSchemaExport('SomethingElse')).toBeNull();
    });
});

describe('contract drift', () => {
    it('every contract stream is either consumed or explicitly ignored', () => {
        const unhandled = listContractStreams().filter(
            s =>
                !(ALL_INBOUND_STREAMS as readonly string[]).includes(s) &&
                !(s in IGNORED_CONTRACT_STREAMS),
        );
        expect(unhandled).toEqual([]);
    });

    it('every consumed stream exists in the contract', () => {
        const contract = listContractStreams();
        expect(ALL_INBOUND_STREAMS.filter(s => !contract.includes(s))).toEqual([]);
    });

    it('no ignored stream is also consumed', () => {
        expect(
            Object.keys(IGNORED_CONTRACT_STREAMS).filter(s =>
                (ALL_INBOUND_STREAMS as readonly string[]).includes(s),
            ),
        ).toEqual([]);
    });
});
