import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { internal_getRequestContext } from '@vendure/core';
import { Observable, switchMap } from 'rxjs';

import { StaffEmailChangeService } from './staff-email-change.service';

interface UpdateCustomerInput {
    id: string | number;
    emailAddress?: string | null;
}

// Takes the address out of the staff update so core keeps the old one; the customer confirms the new one by link.
@Injectable()
export class StaffEmailChangeInterceptor implements NestInterceptor {
    constructor(private changes: StaffEmailChangeService) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
        if (context.getType<string>() !== 'graphql') return next.handle();
        const gql = GqlExecutionContext.create(context);
        const info = gql.getInfo<GraphQLResolveInfo>();
        if (info.parentType.name !== 'Mutation' || info.fieldName !== 'updateCustomer') {
            return next.handle();
        }
        const ctx = internal_getRequestContext(gql.getContext<{ req: never }>().req, context);
        const input = gql.getArgs<{ input?: UpdateCustomerInput }>().input;
        if (ctx.apiType !== 'admin' || !input?.emailAddress) return next.handle();
        const id = Number(input.id);
        const email = input.emailAddress;
        const change = await this.changes.classify(ctx, id, email);
        if (change === 'apply') return next.handle();
        delete input.emailAddress;
        return next.handle().pipe(
            switchMap(async result => {
                if (change === 'staged') await this.changes.stage(ctx, id, email);
                else await this.changes.cancel(ctx, id);
                return result;
            }),
        );
    }
}
