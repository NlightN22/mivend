import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { RuntimeVendureConfig, Type } from '@vendure/core';
import { SignInProtectionPlugin } from '@mivend/plugin-sign-in-protection';

import { OidcResolver } from './api/oidc.resolver';
import { oidcSchema } from './api/oidc.schema';
import { OidcAuthRequest } from './entities/oidc-auth-request.entity';
import { createOidcCleanupTask } from './oidc-cleanup.scheduled-task';
import { OidcIdentityService } from './oidc-identity.service';
import { OidcProviderService } from './oidc-provider.service';
import { OidcRequestStoreService } from './oidc-request-store.service';
import { OidcSignInService } from './oidc-sign-in.service';
import { OIDC_PLUGIN_OPTIONS } from './oidc.types';
import type { OidcPluginOptions } from './oidc.types';
import { OidcAuthenticationStrategy } from './oidc.strategy';

@VendurePlugin({
    imports: [PluginCommonModule, SignInProtectionPlugin],
    entities: [OidcAuthRequest],
    providers: [
        OidcIdentityService,
        OidcProviderService,
        OidcRequestStoreService,
        OidcSignInService,
        {
            provide: OIDC_PLUGIN_OPTIONS,
            useFactory: (): OidcPluginOptions | null => OidcSignInPlugin.options,
        },
    ],
    adminApiExtensions: {
        schema: oidcSchema,
        resolvers: [OidcResolver],
    },
    configuration: (config: RuntimeVendureConfig) => {
        const options = OidcSignInPlugin.options;
        if (!options) return config;
        config.authOptions.adminAuthenticationStrategy = [
            ...config.authOptions.adminAuthenticationStrategy,
            new OidcAuthenticationStrategy(),
        ];
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createOidcCleanupTask(options),
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class OidcSignInPlugin {
    static options: OidcPluginOptions | null = null;

    static init(options: OidcPluginOptions | null): Type<OidcSignInPlugin> {
        this.options = options;
        return OidcSignInPlugin;
    }
}
