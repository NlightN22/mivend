import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';
import { CustomPermission } from '@mivend/plugin-access-control';

import { SettlementAdminResolver } from '../../settlement-admin.resolver';
import { createHarness, ctx, documentInput } from './settlement-harness';
import type { Harness } from './settlement-harness';

let h: Harness;

const register = (documentType: string, label: string, isDeleted = false): Promise<unknown> =>
    h.types.apply(ctx, {
        documentType,
        version: '2026-10-01T10:00:00Z',
        isDeleted,
        label,
        category: 'sale',
        customerVisible: false,
        sortOrder: 1,
    });

const doc = (erpId: string, documentType: string, label: string, isDeleted = false) =>
    h.documents.apply(
        ctx,
        documentInput(erpId, {
            documentType,
            documentTypeLabel: label,
            isDeleted,
            version: isDeleted ? '2026-10-02T10:00:00Z' : '2026-10-01T10:00:00Z',
            entries: [],
        }),
    );

beforeAll(async () => {
    h = await createHarness('settlement_document_type_list');
});

afterAll(async () => {
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    await h.dataSource.query(
        'TRUNCATE settlement_document, settlement_document_type RESTART IDENTITY CASCADE',
    );
});

describe('SettlementDocumentTypeService.listAll (real Postgres)', () => {
    it('returns registry rows without the deleted ones, with no document needed', async () => {
        await register('Sale', 'Sale label');
        await register('Old', 'Old label', true);

        expect(await h.types.listAll(ctx)).toEqual([
            { documentType: 'Sale', label: 'Sale label', category: 'sale', movesTurnover: false },
        ]);
    });

    it('adds types seen only on documents once each, labelled from the document, and no duplicates for registered ones', async () => {
        await register('Sale', 'Sale label');
        await doc('d1', 'Sale', 'Sale on document');
        await doc('d2', 'Sale', 'Sale on document');
        await doc('d3', 'Unlisted', 'Unlisted label');
        await doc('d4', 'Unlisted', 'Unlisted label');
        await doc('d5', 'Zeta', 'Zeta label');

        expect(await h.types.listAll(ctx)).toEqual([
            { documentType: 'Sale', label: 'Sale label', category: 'sale', movesTurnover: false },
            { documentType: 'Unlisted', label: 'Unlisted label', category: null, movesTurnover: false },
            { documentType: 'Zeta', label: 'Zeta label', category: null, movesTurnover: false },
        ]);
    });

    it('ignores deleted documents and falls back to the document for a deleted registry row', async () => {
        await register('Old', 'Old registry label', true);
        await doc('d1', 'Old', 'Old document label');
        await doc('d2', 'Gone', 'Gone label');
        await doc('d2', 'Gone', 'Gone label', true);

        expect(await h.types.listAll(ctx)).toEqual([
            { documentType: 'Old', label: 'Old document label', category: null, movesTurnover: false },
        ]);
    });

    it('is empty without any data', async () => {
        expect(await h.types.listAll(ctx)).toEqual([]);
    });
});

describe('settlementDocumentTypes permission', () => {
    it('is gated by ReadSettlementDocument', () => {
        const meta = Reflect.getMetadata(
            '__permissions__',
            SettlementAdminResolver.prototype.settlementDocumentTypes,
        );
        expect(meta).toContain(CustomPermission.ReadSettlementDocument.Permission);
    });
});
