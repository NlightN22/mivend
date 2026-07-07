import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { OrganizationRequisitesHandler } from '../../handlers/organization-requisites.handler';
import type { OrganizationRequisitesRecord } from '@mivend/plugin-documents';

describe('OrganizationRequisitesHandler', () => {
    it('delegates to DocumentsService.upsertRequisites with the record unchanged', async () => {
        const documentsService = { upsertRequisites: vi.fn(async () => ({})) };
        const handler = new OrganizationRequisitesHandler(documentsService as never);
        const ctx = {} as RequestContext;
        const record: OrganizationRequisitesRecord = {
            erpId: 'org-1',
            legalName: 'Demo Co',
            inn: '000000000000',
            legalAddress: '1 Demo Ave',
        };

        await handler.upsert(ctx, record);

        expect(documentsService.upsertRequisites).toHaveBeenCalledWith(ctx, record);
    });
});
