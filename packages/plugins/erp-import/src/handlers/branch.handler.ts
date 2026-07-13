import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { BranchService } from '@mivend/plugin-access-control';
import type { BranchRecordInput } from '@mivend/plugin-access-control';

@Injectable()
export class BranchHandler {
    constructor(private readonly branchService: BranchService) {}

    async upsert(ctx: RequestContext, record: BranchRecordInput): Promise<void> {
        await this.branchService.upsert(ctx, record);
    }
}
