import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { ctxQuery, withAggregateLock } from 'shared';

import type { Counterparty } from './entities/counterparty.entity';

type InnHolder = Pick<Counterparty, 'id' | 'inn' | 'shortName'>;
type InnStatusHolder = InnHolder & Pick<Counterparty, 'isActive'>;

export interface InnDuplicate {
    id: string;
    shortName: string;
    erpId: string;
}

export function normalizeInn(inn: string | null | undefined): string {
    return (inn ?? '').replace(/\D/g, '');
}

export const INN_DIGITS_SQL = `regexp_replace(coalesce(c.inn, ''), '\\D', '', 'g')`;

// Another active counterparty with this inn that already has a live portal Customer.
export async function findLinkedInnDuplicate(
    connection: Pick<TransactionalConnection, 'getRepository'>,
    ctx: RequestContext,
    counterpartyId: string | number,
    normalizedInn: string,
): Promise<InnDuplicate | null> {
    const rows = await ctxQuery<InnDuplicate[]>(
        connection,
        ctx,
        `SELECT c.id::text AS id, c."shortName" AS "shortName", c."erpId" AS "erpId"
         FROM counterparty c
         WHERE c.id::text <> $1 AND c."isActive" = true AND ${INN_DIGITS_SQL} = $2
           AND EXISTS (SELECT 1 FROM customer cu
                       WHERE cu."customFieldsCounterpartyid"::text = c.id::text AND cu."deletedAt" IS NULL)
         ORDER BY c.id LIMIT 1`,
        [String(counterpartyId), normalizedInn],
    );
    return rows[0] ?? null;
}

// The lock by normalized inn serializes two bindings of duplicates; the check reads under it.
export function withInnBindingGuard<T>(
    connection: Pick<TransactionalConnection, 'withTransaction' | 'getRepository'>,
    ctx: RequestContext,
    counterparty: InnHolder,
    work: (txCtx: RequestContext) => Promise<T>,
): Promise<T> {
    const inn = normalizeInn(counterparty.inn);
    if (!inn) {
        throw new UserInputError(
            `Counterparty "${counterparty.shortName}" has no INN — fill it in the ERP before portal binding`,
        );
    }
    return withAggregateLock(connection, ctx, `counterparty-inn:${inn}`, async txCtx => {
        const duplicate = await findLinkedInnDuplicate(connection, txCtx, counterparty.id, inn);
        if (duplicate) {
            throw new UserInputError(
                `INN ${inn} is already used by counterparty "${duplicate.shortName}" (${duplicate.erpId}) that has portal access — merge the duplicates in the ERP first`,
            );
        }
        return work(txCtx);
    });
}

export type InnStatus = 'ok' | 'missing' | 'duplicate';

export async function getInnStatus(
    connection: Pick<TransactionalConnection, 'getRepository'>,
    ctx: RequestContext,
    counterparty: InnStatusHolder,
): Promise<InnStatus> {
    const inn = normalizeInn(counterparty.inn);
    if (!inn) return 'missing';
    if (!counterparty.isActive) return 'ok';
    const rows = await ctxQuery<unknown[]>(
        connection,
        ctx,
        `SELECT 1 FROM counterparty c
         WHERE c.id::text <> $1 AND c."isActive" = true AND ${INN_DIGITS_SQL} = $2 LIMIT 1`,
        [String(counterparty.id), inn],
    );
    return rows.length > 0 ? 'duplicate' : 'ok';
}
