import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { DocumentsService } from '@mivend/plugin-documents';
import type { DocumentRecord } from '@mivend/plugin-documents';

@Injectable()
export class DocumentHandler {
    constructor(private readonly documentsService: DocumentsService) {}

    async upsert(ctx: RequestContext, record: DocumentRecord): Promise<void> {
        await this.documentsService.upsertFromErp(ctx, record);
    }
}
