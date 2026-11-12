import { Brackets, type SelectQueryBuilder } from 'typeorm';
import { documentNumberSearchTerm } from 'shared';

import { STATUS_SQL, soonThreshold, type DiscountSetupStatus } from './discount-setup-list.types';
import type { DiscountSetup } from './discount-setup.entity';

export interface VisibleCounterparties {
    sql: string;
    params: Record<string, unknown>;
}

export interface SetupScope {
    now: Date;
    // Null = scope 'all': every setup is visible.
    visible: VisibleCounterparties | null;
    allowedPriceTypeCodes: string[];
    counterpartyId?: string | null;
    search?: string | null;
    status?: DiscountSetupStatus | null;
}

const escapeLike = (term: string): string => term.replace(/[\\%_]/g, '\\$&');

// Applies to every counterparty: no recipient rows, or a row with an empty counterparty (docs/pricing.md).
const NO_NAMED_RECIPIENT = `(NOT EXISTS (SELECT 1 FROM discount_setup_recipient r
    WHERE r."setupId" = s."id" AND r."counterpartyErpId" <> '')
    OR EXISTS (SELECT 1 FROM discount_setup_recipient r
    WHERE r."setupId" = s."id" AND r."counterpartyErpId" = ''))`;

// A recipient row the caller may see: all of them for scope 'all', else those naming a visible counterparty.
function seenRecipient(visible: VisibleCounterparties | null, extra = ''): string {
    const scoped = visible ? ` AND r."counterpartyErpId" IN (${visible.sql})` : '';
    return `EXISTS (SELECT 1 FROM discount_setup_recipient r
        JOIN counterparty cp ON cp."erpId" = r."counterpartyErpId"
        WHERE r."setupId" = s."id"${scoped}${extra})`;
}

// The scoped, filtered set shared by the list and the counts; status is applied by the list only.
export function scopedSetups(
    qb: SelectQueryBuilder<DiscountSetup>,
    scope: SetupScope,
): SelectQueryBuilder<DiscountSetup> {
    const { visible } = scope;
    qb.setParameters({
        dsNow: scope.now,
        dsSoon: soonThreshold(scope.now),
        dsCodes: scope.allowedPriceTypeCodes.length ? scope.allowedPriceTypeCodes : [''],
        ...visible?.params,
    });
    qb.where(`(COALESCE(s."priceTypeErpId", '') = '' OR s."priceTypeErpId" IN
        (SELECT pt."externalId" FROM price_type pt WHERE pt."code" IN (:...dsCodes)))`);
    if (visible) qb.andWhere(`(${NO_NAMED_RECIPIENT} OR ${seenRecipient(visible)})`);
    if (scope.counterpartyId) {
        qb.setParameter('dsCounterparty', String(scope.counterpartyId));
        qb.andWhere(
            `(${NO_NAMED_RECIPIENT} OR ${seenRecipient(visible, ' AND cp."id"::text = :dsCounterparty')})`,
        );
    }
    const search = scope.search?.trim();
    if (search) {
        qb.setParameter('dsNumber', documentNumberSearchTerm(search));
        qb.setParameter('dsName', `%${escapeLike(search)}%`);
        qb.andWhere(
            new Brackets(b => {
                b.where('s."documentNumber" ILIKE :dsNumber').orWhere(
                    seenRecipient(
                        visible,
                        ' AND (cp."legalName" ILIKE :dsName OR cp."shortName" ILIKE :dsName)',
                    ),
                );
            }),
        );
    }
    return qb;
}

export function withStatus(
    qb: SelectQueryBuilder<DiscountSetup>,
    status: DiscountSetupStatus | null | undefined,
): SelectQueryBuilder<DiscountSetup> {
    return status ? qb.andWhere(STATUS_SQL[status]) : qb;
}
