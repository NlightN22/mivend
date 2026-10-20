import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { DepartmentBranchMappingService } from '@mivend/plugin-access-control';

export interface DepartmentBranchRecordInput {
    departmentErpId: string;
    branchErpId: string;
}

@Injectable()
export class DepartmentBranchHandler {
    constructor(private readonly mappingService: DepartmentBranchMappingService) {}

    async upsert(ctx: RequestContext, record: DepartmentBranchRecordInput): Promise<void> {
        await this.mappingService.setByBranchErpId(ctx, record.departmentErpId, record.branchErpId);
    }
}
