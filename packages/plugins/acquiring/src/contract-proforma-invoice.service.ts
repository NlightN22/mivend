import { Injectable } from '@nestjs/common';
import {
    CustomerService,
    EventBus,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { ctxQuery, DEFAULT_PROFORMA_PAYMENT_TERM_DAYS, withAggregateLock } from 'shared';
import { BranchSettingsService } from '@mivend/plugin-access-control';
import { ContractService, TradingPointService } from '@mivend/plugin-counterparty';
import { NumberingService } from '@mivend/plugin-numbering';

import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { addDays } from './proforma-invoice-number';
import { ProformaInvoiceIssuedEvent } from './proforma-invoice-issued.event';
import {
    assertContractProformaInput,
    contractProformaLine,
    IssueContractProformaInvoiceInput,
} from './contract-proforma-invoice';

// Contract payment proformas (#260): not linked to payments, never allocated, not sent to the ERP.
@Injectable()
export class ContractProformaInvoiceService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private tradingPointService: TradingPointService,
        private contractService: ContractService,
        private numberingService: NumberingService,
        private branchSettingsService: BranchSettingsService,
        private eventBus: EventBus,
    ) {}

    async issue(
        ctx: RequestContext,
        input: IssueContractProformaInvoiceInput,
    ): Promise<ProformaInvoice> {
        assertContractProformaInput(input);
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);
        if (!counterpartyId) throw new ForbiddenError();
        const contracts = await this.contractService.findActiveCustomerContracts(
            ctx,
            counterpartyId,
        );
        const contract = contracts.find(c => String(c.id) === String(input.contractId));
        if (!contract) throw new ForbiddenError();
        const organizationId = await this.organizationIdOf(ctx, contract.organizationId);
        const branchId = await this.branchOf(ctx);
        const contractName = contract.name ?? contract.erpId;

        const { invoice, created } = await withAggregateLock(
            this.connection,
            ctx,
            `contract-proforma:${counterpartyId}:${input.idempotencyKey}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, ProformaInvoice);
                const existing = await repo.findOne({
                    where: {
                        counterpartyId: Number(counterpartyId),
                        idempotencyKey: input.idempotencyKey,
                    },
                });
                if (existing) return { invoice: existing, created: false };
                const settings = await this.branchSettingsService.resolveEffective(txCtx, branchId);
                const issuedAt = new Date();
                const saved = await repo.save(
                    repo.create({
                        orderId: null,
                        number: await this.numberingService.next(txCtx, 'proforma-invoice'),
                        organizationId,
                        counterpartyId: Number(counterpartyId),
                        branchId,
                        amount: input.amount,
                        currencyCode: contract.currency ?? ctx.channel.defaultCurrencyCode,
                        status: 'issued',
                        lines: [contractProformaLine(input.mode, contractName, input.amount)],
                        version: 1,
                        kind: input.mode,
                        issuedAt,
                        dueDate: addDays(
                            issuedAt,
                            settings?.proformaPaymentTermDays ?? DEFAULT_PROFORMA_PAYMENT_TERM_DAYS,
                        ),
                        contractId: String(contract.id),
                        contractName,
                        idempotencyKey: input.idempotencyKey,
                    }),
                );
                return { invoice: saved, created: true };
            },
        );
        if (created) await this.eventBus.publish(new ProformaInvoiceIssuedEvent(ctx, invoice));
        return invoice;
    }

    // Contract.organizationId is the organization's ERP id; proformas reference the requisites row.
    private async organizationIdOf(ctx: RequestContext, erpId: string): Promise<number> {
        const rows = await ctxQuery<Array<{ id: number }>>(
            this.connection,
            ctx,
            `SELECT id FROM organization_requisites WHERE "erpId" = $1`,
            [erpId],
        );
        if (!rows[0]) throw new UserInputError('The contract has no known organization');
        return Number(rows[0].id);
    }

    private async branchOf(ctx: RequestContext): Promise<string | null> {
        const customer = ctx.activeUserId
            ? await this.customerService.findOneByUserId(ctx, ctx.activeUserId)
            : undefined;
        if (!customer) return null;
        const point = await this.tradingPointService.getPreferredForCustomer(ctx, customer.id);
        return point ? this.tradingPointService.resolveServicingBranchId(ctx, point) : null;
    }
}
