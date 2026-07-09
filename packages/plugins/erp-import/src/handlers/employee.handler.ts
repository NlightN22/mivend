import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { EmployeeService } from '@mivend/plugin-access-control';
import type { EmployeeRecordInput } from '@mivend/plugin-access-control';

@Injectable()
export class EmployeeHandler {
    constructor(private readonly employeeService: EmployeeService) {}

    async upsert(ctx: RequestContext, record: EmployeeRecordInput): Promise<void> {
        await this.employeeService.upsert(ctx, record);
    }
}
