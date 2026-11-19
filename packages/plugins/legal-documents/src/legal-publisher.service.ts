import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { Logger, RequestContextService, TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { LegalDocumentVersion } from './entities/legal-document-version.entity';
import { missingRequisites, renderTemplate } from './requisites';
import type { LegalRequisites } from './requisites';
import { LEGAL_TEMPLATES } from './templates';
import { LEGAL_DOCUMENTS_OPTIONS } from './types';
import type { LegalDocumentsOptions } from './types';

const loggerCtx = 'LegalDocuments';

@Injectable()
export class LegalPublisherService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private requestContexts: RequestContextService,
        @Inject(LEGAL_DOCUMENTS_OPTIONS) private options: LegalDocumentsOptions,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        const ctx = await this.requestContexts.create({ apiType: 'admin' });
        const published = await this.publishMissing(ctx);
        if (published > 0)
            Logger.info(`Published ${published} legal document version(s)`, loggerCtx);
    }

    // Returns how many versions were inserted. Without every requisite nothing is published,
    // so no one is asked to accept a text with empty placeholders.
    async publishMissing(ctx: RequestContext): Promise<number> {
        const missing = missingRequisites(this.options.requisites);
        if (missing.length > 0) {
            Logger.warn(
                `Legal documents not published, missing requisites: ${missing.join(', ')}`,
                loggerCtx,
            );
            return 0;
        }
        const requisites = this.options.requisites as LegalRequisites;
        const effectiveDate = new Date();
        let inserted = 0;
        for (const template of LEGAL_TEMPLATES) {
            const result = await this.connection
                .getRepository(ctx, LegalDocumentVersion)
                .createQueryBuilder()
                .insert()
                .values({
                    uuid: randomUUID(),
                    kind: template.kind,
                    version: template.version,
                    locale: template.locale,
                    title: template.title,
                    template: template.body,
                    body: renderTemplate(template.body, requisites, {
                        version: `${template.version}.0`,
                        effectiveDate,
                    }),
                    effectiveDate,
                    requiresReacceptance: template.requiresReacceptance,
                })
                .orIgnore()
                .execute();
            inserted += result.identifiers.filter(Boolean).length;
        }
        return inserted;
    }
}
