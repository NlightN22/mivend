import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { RuntimeVendureConfig } from '@vendure/core';

import { siteLanguageSchema } from './api/schema';
import { addDefaultLanguageField } from './site-language-custom-field';
import { SiteLanguageResolver } from './site-language.resolver';
import { SiteLanguageService } from './site-language.service';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [SiteLanguageService],
    adminApiExtensions: { schema: siteLanguageSchema, resolvers: [SiteLanguageResolver] },
    shopApiExtensions: { schema: siteLanguageSchema, resolvers: [SiteLanguageResolver] },
    configuration: (config: RuntimeVendureConfig) => {
        addDefaultLanguageField(config);
        return config;
    },
    compatibility: '>0.0.0',
})
export class SiteLanguagePlugin {}
