import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { DocumentHandler } from '../../handlers/document.handler';
import type { DocumentRecord } from '@mivend/plugin-documents';

describe('DocumentHandler', () => {
    it('delegates to DocumentsService.upsertFromErp with the record unchanged', async () => {
        const documentsService = { upsertFromErp: vi.fn(async () => ({})) };
        const handler = new DocumentHandler(documentsService as never);
        const ctx = {} as RequestContext;
        const record: DocumentRecord = {
            erpId: 'doc-1',
            type: 'return',
            counterpartyErpId: 'cnt-001',
            number: 'RET-1',
            issueDate: '2026-07-01',
        };

        await handler.upsert(ctx, record);

        expect(documentsService.upsertFromErp).toHaveBeenCalledWith(ctx, record);
    });
});
