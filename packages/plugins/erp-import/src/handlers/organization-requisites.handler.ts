import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { DocumentsService } from '@mivend/plugin-documents';
import type { OrganizationRequisitesRecord } from '@mivend/plugin-documents';

@Injectable()
export class OrganizationRequisitesHandler {
    constructor(private readonly documentsService: DocumentsService) {}

    async upsert(ctx: RequestContext, record: OrganizationRequisitesRecord): Promise<void> {
        await this.documentsService.upsertRequisites(ctx, record);
    }
}
