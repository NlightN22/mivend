import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { ManufacturerService } from '@mivend/plugin-erp-integration';
import type { ManufacturerRecord } from '../types';

@Injectable()
export class ManufacturerHandler {
    constructor(private readonly manufacturerService: ManufacturerService) {}

    async upsert(ctx: RequestContext, record: ManufacturerRecord): Promise<void> {
        await this.manufacturerService.upsert(ctx, record.code, record.name);
    }
}
