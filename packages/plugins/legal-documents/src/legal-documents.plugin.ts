import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { Type } from '@vendure/core';

import { legalDocumentsSchema } from './api/schema';
import { LegalAcceptance } from './entities/legal-acceptance.entity';
import { LegalDocumentVersion } from './entities/legal-document-version.entity';
import { LegalDocumentsResolver } from './legal-documents.resolver';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalPublisherService } from './legal-publisher.service';
import { LEGAL_DOCUMENTS_OPTIONS } from './types';
import type { LegalDocumentsOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [LegalDocumentVersion, LegalAcceptance],
    providers: [
        LegalDocumentsService,
        LegalPublisherService,
        {
            provide: LEGAL_DOCUMENTS_OPTIONS,
            useFactory: (): LegalDocumentsOptions => LegalDocumentsPlugin.options,
        },
    ],
    exports: [LegalDocumentsService],
    shopApiExtensions: { schema: legalDocumentsSchema, resolvers: [LegalDocumentsResolver] },
    compatibility: '>0.0.0',
})
export class LegalDocumentsPlugin {
    static options: LegalDocumentsOptions;

    static init(options: LegalDocumentsOptions): Type<LegalDocumentsPlugin> {
        this.options = options;
        return LegalDocumentsPlugin;
    }
}
