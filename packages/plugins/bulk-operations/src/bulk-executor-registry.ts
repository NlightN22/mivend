import { Injectable } from '@nestjs/common';
import { ForbiddenError, RequestContext, UserInputError } from '@vendure/core';
import type { Permission } from '@vendure/common/lib/generated-types';

import type { BulkExecutor } from './bulk-executor';

@Injectable()
export class BulkExecutorRegistry {
    private readonly executors = new Map<string, BulkExecutor>();

    register(executor: BulkExecutor): void {
        if (this.executors.has(executor.type)) {
            throw new Error(`Bulk operation "${executor.type}" is already registered`);
        }
        this.executors.set(executor.type, executor);
    }

    get(type: string): BulkExecutor {
        const executor = this.executors.get(type);
        if (!executor) throw new UserInputError(`Unknown bulk operation: ${type}`);
        return executor;
    }

    allowed(ctx: RequestContext): BulkExecutor[] {
        return [...this.executors.values()].filter(e => this.canRun(ctx, e));
    }

    assertAllowed(ctx: RequestContext, executor: BulkExecutor): void {
        if (!this.canRun(ctx, executor)) throw new ForbiddenError();
    }

    private canRun(ctx: RequestContext, executor: BulkExecutor): boolean {
        return ctx.userHasPermissions([executor.permission as Permission]);
    }
}
