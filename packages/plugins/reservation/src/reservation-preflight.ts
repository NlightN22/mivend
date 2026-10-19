import { ID, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';
import { PackagingPolicyService } from '@mivend/plugin-moq';

import type { ErpExportDataMissingLine, InvalidMultiplicityLine } from './reservation-errors';
import { ctxQuery } from 'shared';

export async function findMultiplicityViolations(
    packagingPolicyService: PackagingPolicyService,
    ctx: RequestContext,
    order: Order,
): Promise<InvalidMultiplicityLine[]> {
    const violations: InvalidMultiplicityLine[] = [];
    for (const line of order.lines) {
        const effective = line.productVariant
            ? await packagingPolicyService.requiredMultiple(
                  ctx,
                  line.productVariant,
                  order.customerId,
                  order.customFields?.branchId ?? null,
              )
            : 1;
        if (line.quantity % effective !== 0) {
            violations.push({
                orderLineId: String(line.id),
                productVariantId: String(line.productVariantId),
                quantity: line.quantity,
                multiplicity: effective,
            });
        }
    }
    return violations;
}

export interface ErpExportGaps {
    missingCustomerId: boolean;
    missingContract: boolean;
    lines: ErpExportDataMissingLine[];
}

interface ErpExportDeps {
    connection: TransactionalConnection;
    counterpartyService: CounterpartyService;
    contractService: ContractService;
}

// Everything the ERP order.confirmed event needs must resolve before any Reservation is written (mivend#85).
export async function findErpExportGaps(
    deps: ErpExportDeps,
    ctx: RequestContext,
    order: Order,
    candidateLocationIds: string[],
): Promise<ErpExportGaps> {
    let missingCustomerId = false;
    let missingContract = false;
    if (!order.customerId) {
        missingCustomerId = true;
    } else {
        const counterparty = await deps.counterpartyService.getForCustomer(ctx, order.customerId);
        if (!counterparty) {
            missingCustomerId = true;
        } else {
            const contract = await deps.contractService.resolveOrderContract(
                ctx,
                counterparty,
                order.customFields?.selectedContractId,
                order.customerId,
            );
            missingContract = !contract;
        }
    }

    const externalIds = await productExternalIds(deps.connection, ctx, order);
    const lines: ErpExportDataMissingLine[] = [];
    for (const line of order.lines) {
        const missing: ErpExportDataMissingLine['missing'] = [];
        const productId = line.productVariant?.productId;
        if (!productId || !externalIds.has(String(productId))) missing.push('productId');
        if (candidateLocationIds.length === 0) missing.push('warehouseId');
        if (line.customFields?.organizationId == null) missing.push('organizationId');
        if (missing.length > 0) {
            lines.push({
                orderLineId: String(line.id),
                productVariantId: String(line.productVariantId),
                missing,
            });
        }
    }
    return { missingCustomerId, missingContract, lines };
}

// Product.customFields.externalId is not on the typed entity here, so it is read through raw SQL.
async function productExternalIds(
    connection: TransactionalConnection,
    ctx: RequestContext,
    order: Order,
): Promise<Set<string>> {
    const productIds = [
        ...new Set(
            order.lines.map(l => l.productVariant?.productId).filter((id): id is ID => id != null),
        ),
    ];
    if (productIds.length === 0) return new Set();
    const rows = await ctxQuery<Array<{ id: string; externalId: string | null }>>(
        connection,
        ctx,
        `SELECT p.id, p."customFieldsExternalid" AS "externalId" FROM product p WHERE p.id = ANY($1)`,
        [productIds.map(Number)],
    );
    return new Set(rows.filter(r => r.externalId).map(r => String(r.id)));
}
