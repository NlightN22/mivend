import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Asset,
    AssetService,
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
        @Args() args: { options?: DocumentListOptions },
    ): Promise<PaginatedList<Document>> {
        return this.documentsService.findVisible(ctx, args.options);
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
    constructor(private assetService: AssetService) {}

    // Returning the real Asset type (not a manually-built URL string) lets
    // GraphQL resolve Asset.source/preview through Vendure's own resolver chain
    // (registered by AssetServerPlugin), which prefixes the storage path with the
    // correct protocol/host — building the URL manually here would bypass that
    // and return a bare relative path.
    @ResolveField()
    async asset(@Ctx() ctx: RequestContext, @Parent() doc: Document): Promise<Asset | undefined> {
        if (!doc.assetId) return undefined;
        return this.assetService.findOne(ctx, doc.assetId);
    }
}
