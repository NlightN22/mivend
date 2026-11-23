import { APP_INTERCEPTOR } from '@nestjs/core';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { Type } from '@vendure/core';
import { NotificationPlugin } from '@mivend/plugin-notification';

import { legalDocumentsAdminSchema } from './api/admin-schema';
import { legalDocumentsSchema } from './api/schema';
import { EmailConfirmationAdminResolver } from './email-confirmation-admin.resolver';
import { EmailConfirmationListener } from './email-confirmation.listener';
import { EmailConfirmationNotifier } from './email-confirmation.notifier';
import { EmailConfirmationService } from './email-confirmation.service';
import { EmailConfirmation } from './entities/email-confirmation.entity';
import { LegalAcceptance } from './entities/legal-acceptance.entity';
import { LegalDocumentVersion } from './entities/legal-document-version.entity';
import { LegalDocumentsResolver } from './legal-documents.resolver';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalPublisherService } from './legal-publisher.service';
import { StaffEmailChangeInterceptor } from './staff-email-change.interceptor';
import { StaffEmailChangeService } from './staff-email-change.service';
import { LEGAL_DOCUMENTS_OPTIONS } from './types';
import type { LegalDocumentsOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule, NotificationPlugin],
    entities: [LegalDocumentVersion, LegalAcceptance, EmailConfirmation],
    providers: [
        LegalDocumentsService,
        LegalPublisherService,
        EmailConfirmationService,
        EmailConfirmationNotifier,
        EmailConfirmationListener,
        StaffEmailChangeService,
        { provide: APP_INTERCEPTOR, useClass: StaffEmailChangeInterceptor },
        {
            provide: LEGAL_DOCUMENTS_OPTIONS,
            useFactory: (): LegalDocumentsOptions => LegalDocumentsPlugin.options,
        },
    ],
    exports: [LegalDocumentsService],
    shopApiExtensions: { schema: legalDocumentsSchema, resolvers: [LegalDocumentsResolver] },
    adminApiExtensions: {
        schema: legalDocumentsAdminSchema,
        resolvers: [EmailConfirmationAdminResolver],
    },
    compatibility: '>0.0.0',
})
export class LegalDocumentsPlugin {
    static options: LegalDocumentsOptions;

    static init(options: LegalDocumentsOptions): Type<LegalDocumentsPlugin> {
        this.options = options;
        return LegalDocumentsPlugin;
    }
}
