import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import type { DocumentStatus } from './document-status';
import type { LegalAcceptance } from './entities/legal-acceptance.entity';
import type { LegalDocumentVersion } from './entities/legal-document-version.entity';
import { EmailConfirmationNotifier } from './email-confirmation.notifier';
import { EmailConfirmationService } from './email-confirmation.service';
import { LegalDocumentsService } from './legal-documents.service';
import type { AcceptanceInput } from './legal-documents.service';

@Resolver()
export class LegalDocumentsResolver {
    constructor(
        private legal: LegalDocumentsService,
        private confirmations: EmailConfirmationService,
        private notifier: EmailConfirmationNotifier,
    ) {}

    // Public: the policy must be readable before anyone signs in.
    @Query()
    @Allow(Permission.Public)
    async legalDocument(
        @Ctx() ctx: RequestContext,
        @Args() args: { kind: string; locale?: string | null },
    ): Promise<(Omit<LegalDocumentVersion, 'assignUuid'> & { versionLabel: string }) | null> {
        const document = await this.legal.currentDocument(ctx, args.kind, args.locale);
        return document && { ...document, versionLabel: `${document.version}.0` };
    }

    // Public: the sign-in form lists what a customer will be asked to accept.
    @Query()
    @Allow(Permission.Public)
    legalConsentOffer(
        @Ctx() ctx: RequestContext,
    ): Promise<{ kind: string; version: number; requiredVersion: number; required: boolean }[]> {
        return this.legal.consentOffer(ctx);
    }

    // Authenticated only: the service scopes every row to the caller's own customer.
    @Query()
    @Allow(Permission.Authenticated)
    legalDocumentStatus(@Ctx() ctx: RequestContext): Promise<DocumentStatus[]> {
        return this.legal.statuses(ctx);
    }

    @Query()
    @Allow(Permission.Authenticated)
    legalAcceptanceHistory(
        @Ctx() ctx: RequestContext,
        @Args() args: { skip?: number | null; take?: number | null },
    ): Promise<{ items: LegalAcceptance[]; totalItems: number }> {
        return this.legal.history(ctx, args.skip ?? undefined, args.take ?? undefined);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    acceptLegalDocuments(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: AcceptanceInput[]; locale?: string | null },
    ): Promise<DocumentStatus[]> {
        return this.legal.accept(ctx, args.input, args.locale);
    }

    // Public: the link is opened from a mail, possibly signed out; the token is the proof.
    @Mutation()
    @Allow(Permission.Public)
    async confirmEmailAddress(
        @Ctx() ctx: RequestContext,
        @Args() args: { token: string },
    ): Promise<boolean> {
        const confirmed = await this.confirmations.confirmByToken(ctx, args.token);
        if (confirmed) await this.notifier.resolve(ctx, confirmed.customerId);
        return confirmed !== null;
    }
}
