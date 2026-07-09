import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { DepartmentService } from '@mivend/plugin-access-control';
import type { DepartmentRecordInput } from '@mivend/plugin-access-control';

@Injectable()
export class DepartmentHandler {
    constructor(private readonly departmentService: DepartmentService) {}

    async upsert(ctx: RequestContext, record: DepartmentRecordInput): Promise<void> {
        await this.departmentService.upsert(ctx, record);
    }
}
