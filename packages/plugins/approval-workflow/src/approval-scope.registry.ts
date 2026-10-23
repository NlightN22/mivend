import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { SelectQueryBuilder } from 'typeorm';

import { ApprovalRequest } from './entities/approval-request.entity';

export interface ApprovalScopeSql {
    sql: string;
    params: Record<string, unknown>;
}

// SQL over `request` for the requests of one type the caller may see; a null result means all of them.
export type ApprovalScopeRule = (ctx: RequestContext) => Promise<ApprovalScopeSql | null>;

// A payload field as text; an unparsable payload yields NULL, so it matches no scope.
export const payloadField = (field: string): string =>
    `(CASE WHEN pg_input_is_valid(request.payload, 'jsonb') THEN request.payload::jsonb ->> '${field}' END)`;

// Each rule's parameters are renamed per rule, so rules built from different scopes never collide.
function prefixed(rule: ApprovalScopeSql, prefix: string): ApprovalScopeSql {
    const names = new Set(Object.keys(rule.params));
    const sql = rule.sql.replace(/(?<!:):(\.\.\.)?([A-Za-z_]\w*)/g, (match, spread, name) =>
        names.has(name) ? `:${spread ?? ''}${prefix}${name}` : match,
    );
    const params = Object.fromEntries(
        Object.entries(rule.params).map(([name, value]) => [`${prefix}${name}`, value]),
    );
    return { sql, params };
}

// Deny by default (#263): every request type is registered with a scope rule, or with null when company-wide.
@Injectable()
export class ApprovalScopeRegistry {
    private readonly rules = new Map<string, ApprovalScopeRule | null>();

    constructor(private connection: TransactionalConnection) {}

    register(requestType: string, rule: ApprovalScopeRule | null): void {
        this.rules.set(requestType, rule);
    }

    assertDeclared(requestType: string): void {
        if (!this.rules.has(requestType))
            throw new Error(`Approval request type ${requestType} has no declared scope rule`);
    }

    // Unregistered types match neither list, so their rows stay hidden.
    async clause(ctx: RequestContext): Promise<ApprovalScopeSql> {
        const open: string[] = [];
        const branches: string[] = [];
        let params: Record<string, unknown> = {};
        let index = 0;
        for (const [requestType, rule] of this.rules) {
            const found = rule ? await rule(ctx) : null;
            if (!found) {
                open.push(requestType);
                continue;
            }
            const prefix = `approvalScope${index++}_`;
            const own = prefixed(found, prefix);
            branches.push(`(request.requestType = :${prefix}type AND ${own.sql})`);
            params = { ...params, ...own.params, [`${prefix}type`]: requestType };
        }
        if (open.length > 0) branches.unshift('request.requestType IN (:...approvalOpenTypes)');
        if (branches.length === 0) return { sql: '1 = 0', params: {} };
        return {
            sql: `(${branches.join(' OR ')})`,
            params: open.length > 0 ? { ...params, approvalOpenTypes: open } : params,
        };
    }

    async apply(ctx: RequestContext, qb: SelectQueryBuilder<ApprovalRequest>): Promise<void> {
        const clause = await this.clause(ctx);
        qb.andWhere(clause.sql, clause.params);
    }

    async isVisible(ctx: RequestContext, requestId: ID): Promise<boolean> {
        const qb = this.connection
            .getRepository(ctx, ApprovalRequest)
            .createQueryBuilder('request')
            .where('request.id = :scopeRequestId', { scopeRequestId: requestId });
        await this.apply(ctx, qb);
        return (await qb.getCount()) > 0;
    }
}
