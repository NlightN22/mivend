import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PositionService } from '@mivend/plugin-access-control';
import type { PositionRecordInput } from '@mivend/plugin-access-control';

@Injectable()
export class PositionHandler {
    constructor(private readonly positionService: PositionService) {}

    async upsert(ctx: RequestContext, record: PositionRecordInput): Promise<void> {
        await this.positionService.upsert(ctx, record);
    }
}
