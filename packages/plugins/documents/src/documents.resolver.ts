import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    CustomerService,
    PaginatedList,
    Permission,
    RequestContext,
} from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { CustomPermission } from '@mivend/plugin-access-control';

import { Document } from './entities/document.entity';
import { OrganizationRequisites } from './entities/organization-requisites.entity';
import { hasRequiredRequisites } from './requisites-completeness';
import { DocumentsService, DocumentListOptions } from './documents.service';
import { PdfGeneratorService } from './pdf/pdf-generator.service';

@Resolver()
export class DocumentsResolver {
    constructor(
        private documentsService: DocumentsService,
        private customerService: CustomerService,
        private counterpartyService: CounterpartyService,
    ) {}

    @Query()
    @Allow(Permission.Owner)
    async myDocuments(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: DocumentListOptions },
    ): Promise<PaginatedList<Document>> {
        if (!ctx.activeUserId) {
            return { items: [], totalItems: 0 };
        }
        const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
        if (!customer) {
            return { items: [], totalItems: 0 };
        }
        const counterparty = await this.counterpartyService.getForCustomer(ctx, customer.id);
        if (!counterparty) {
            return { items: [], totalItems: 0 };
        }
        return this.documentsService.findForCounterparty(ctx, counterparty.id, args.options);
    }
}

@Resolver()
export class DocumentsAdminResolver {
    constructor(
        private documentsService: DocumentsService,
        private pdfGeneratorService: PdfGeneratorService,
    ) {}

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async documents(
        @Ctx() ctx: RequestContext,
        @Args()
        args: { options?: DocumentListOptions; counterpartyId?: string; orderId?: string },
    ): Promise<PaginatedList<Document>> {
        return this.documentsService.findVisible(
            ctx,
            args.options,
            args.counterpartyId,
            args.orderId,
        );
    }

    @Query()
    @Allow(Permission.ReadCustomer, CustomPermission.ReadCounterparty.Permission)
    async documentTypes(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId?: string },
    ): Promise<string[]> {
        return this.documentsService.findVisibleTypes(ctx, args.counterpartyId);
    }

    @Query()
    @Allow(Permission.ReadCustomer)
    async organizationRequisites(@Ctx() ctx: RequestContext): Promise<OrganizationRequisites[]> {
        return this.documentsService.findAllRequisites(ctx);
    }

    @Mutation()
    @Allow(Permission.UpdateCustomer)
    async generateContract(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: string },
    ): Promise<boolean> {
        const document = await this.documentsService.createContractPlaceholder(
            ctx,
            args.counterpartyId,
        );
        await this.pdfGeneratorService.enqueue(document.id);
        return true;
    }

    @Mutation()
    @Allow(Permission.UpdateCustomer)
    async setOrganizationLogo(
        @Ctx() ctx: RequestContext,
        @Args() args: { erpId: string; assetId: string },
    ): Promise<boolean> {
        await this.documentsService.setLogo(ctx, args.erpId, args.assetId);
        return true;
    }
}

@Resolver('Document')
export class DocumentFieldResolver {
    // Root-relative: each portal proxies /document-pdf to the server, so its session cookie goes along.
    @ResolveField()
    pdfUrl(@Parent() doc: Document): string | null {
        return doc.source === 'generated' && doc.status === 'ready'
            ? `/document-pdf/${doc.uuid}`
            : null;
    }
}

@Resolver('OrganizationRequisites')
export class OrganizationFieldResolver {
    // Derived, not stored; inn/legalAddress are intentionally not exposed on this type.
    // v1 manager UI only needs the completeness flag, so the partial legal fields stay out of scope.
    @ResolveField()
    hasCompleteRequisites(@Parent() requisites: OrganizationRequisites): boolean {
        return hasRequiredRequisites(requisites);
    }
}

@Resolver('ProformaInvoice')
export class ProformaInvoiceDocumentFieldResolver {
    constructor(private documentsService: DocumentsService) {}

    @ResolveField()
    seller(
        @Ctx() ctx: RequestContext,
        @Parent() proformaInvoice: { organizationId: number },
    ): Promise<OrganizationRequisites> {
        return this.documentsService.getRequisitesById(ctx, proformaInvoice.organizationId);
    }

    @ResolveField()
    document(
        @Ctx() ctx: RequestContext,
        @Parent() proformaInvoice: { id: number | string },
    ): Promise<Document | null> {
        return this.documentsService.findForProformaInvoice(ctx, proformaInvoice.id);
    }
}
