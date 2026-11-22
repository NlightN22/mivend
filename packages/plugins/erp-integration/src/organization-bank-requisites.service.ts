import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { OrganizationEventService } from '@mivend/plugin-documents';
import { ctxQueryBounded } from 'shared';

interface BankChainRow {
    orgErpId: string;
    accountNumber: string;
    bankName: string;
    bik: string;
    correspondentAccount: string | null;
}

export type BankChainTrigger =
    | { organizationErpId: string }
    | { bankAccountId: string }
    | { bankId: string };

const TRIGGER_FILTER = {
    organizationErpId: 'o."erpId"',
    bankAccountId: 'o."mainBankAccountId"',
    bankId: 'a."bankId"',
} as const;

const MAX_ORGANIZATIONS = 1000;

// Bank requisites of an organization are derived: main account id -> account record -> bank record.
// Any of the three streams can arrive last, so each of them calls refresh.
@Injectable()
export class OrganizationBankRequisitesService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly organizations: OrganizationEventService,
    ) {}

    async refresh(ctx: RequestContext, trigger: BankChainTrigger): Promise<number> {
        const [key, value] = Object.entries(trigger)[0] as [keyof typeof TRIGGER_FILTER, string];
        const rows = await ctxQueryBounded<BankChainRow>(
            this.connection,
            ctx,
            `SELECT o."erpId" AS "orgErpId", a."accountNumber", b.name AS "bankName", b.bik,
                    b."correspondentAccount"
               FROM organization_requisites o
               JOIN bank_account_record a ON a."entityId" = o."mainBankAccountId"
               JOIN bank_record b ON b."entityId" = a."bankId"
              WHERE a."isDeleted" = false AND b."isDeleted" = false AND ${TRIGGER_FILTER[key]} = $1`,
            [value],
            MAX_ORGANIZATIONS,
        );
        for (const row of rows) {
            await this.organizations.applyDerived(ctx, row.orgErpId, {
                bankName: row.bankName,
                bankAccount: row.accountNumber,
                bankBik: row.bik,
                correspondentAccount: row.correspondentAccount,
            });
        }
        return rows.length;
    }
}
