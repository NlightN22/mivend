import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { UserInputError } from '@vendure/core';

// Vendure validates OrderLine custom fields only in a top-level `customFields` arg, so these Admin inputs skip the readonly check.
const NESTED_ORDER_LINE_MUTATIONS = new Set([
    'addItemToDraftOrder',
    'adjustDraftOrderLine',
    'modifyOrder',
]);

export function findCustomFieldKeys(value: unknown, keys: string[] = []): string[] {
    if (Array.isArray(value)) {
        value.forEach(v => findCustomFieldKeys(v, keys));
    } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            if (k === 'customFields' && v && typeof v === 'object') {
                keys.push(
                    ...Object.keys(v).filter(n => (v as Record<string, unknown>)[n] !== undefined),
                );
            } else {
                findCustomFieldKeys(v, keys);
            }
        }
    }
    return keys;
}

@Injectable()
export class OrderLineCustomFieldsInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
        if (context.getType<string>() !== 'graphql') return next.handle();
        const gql = GqlExecutionContext.create(context);
        const info = gql.getInfo<GraphQLResolveInfo>();
        if (
            info.parentType.name !== 'Mutation' ||
            !NESTED_ORDER_LINE_MUTATIONS.has(info.fieldName)
        ) {
            return next.handle();
        }
        const [first] = findCustomFieldKeys(gql.getArgs());
        if (first) throw new UserInputError(`The custom field "${first}" is readonly`);
        return next.handle();
    }
}
