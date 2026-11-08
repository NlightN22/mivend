import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { RuntimeVendureConfig, Type } from '@vendure/core';
import { SessionManagementPlugin } from '@mivend/plugin-session-management';
import { VersioningPlugin } from '@mivend/plugin-versioning';

import { ShopAccountSetupResolver } from './api/shop-account-setup.resolver';
import { TwoFactorResolver } from './api/two-factor.resolver';
import { twoFactorSchema } from './api/two-factor.schema';
import {
    CompleteTwoFactorRecoveryResultResolver,
    ConfirmTwoFactorEnrolmentResultResolver,
    StartTwoFactorEnrolmentResultResolver,
    StartTwoFactorSignInResultResolver,
} from './api/two-factor-union.resolvers';
import { TwoFactorFactor } from './entities/two-factor-factor.entity';
import { TwoFactorToken } from './entities/two-factor-token.entity';
import { FactorStoreService } from './factor-store.service';
import { TokenStoreService } from './token-store.service';
import { TwoFactorAuditService } from './two-factor-audit.service';
import { TwoFactorAuthenticationStrategy } from './two-factor-authentication.strategy';
import { TwoFactorChallengeService } from './two-factor-challenge.service';
import { createTwoFactorCleanupTask } from './two-factor-cleanup.scheduled-task';
import { TwoFactorEnrolmentService } from './two-factor-enrolment.service';
import { TwoFactorLockService } from './two-factor-lock.service';
import { TwoFactorNativeAuthenticationStrategy } from './two-factor-native.strategy';
import { TwoFactorPolicyService } from './two-factor-policy.service';
import { TwoFactorRecoveryService } from './two-factor-recovery.service';
import { TwoFactorVerificationService } from './two-factor-verification.service';
import { TWO_FACTOR_PLUGIN_OPTIONS } from './two-factor.types';
import type { TwoFactorPluginOptions } from './two-factor.types';
import { SecondFactorMethodRegistry } from './totp/second-factor-method';
import { totpMethod } from './totp/totp-method';

const resolvers = [
    TwoFactorResolver,
    StartTwoFactorSignInResultResolver,
    StartTwoFactorEnrolmentResultResolver,
    ConfirmTwoFactorEnrolmentResultResolver,
    CompleteTwoFactorRecoveryResultResolver,
];

@VendurePlugin({
    imports: [PluginCommonModule, SessionManagementPlugin, VersioningPlugin],
    entities: [TwoFactorFactor, TwoFactorToken],
    providers: [
        FactorStoreService,
        TokenStoreService,
        TwoFactorAuditService,
        TwoFactorChallengeService,
        TwoFactorEnrolmentService,
        TwoFactorLockService,
        TwoFactorPolicyService,
        TwoFactorRecoveryService,
        TwoFactorVerificationService,
        {
            provide: SecondFactorMethodRegistry,
            useFactory: () => new SecondFactorMethodRegistry([totpMethod]),
        },
        {
            provide: TwoFactorNativeAuthenticationStrategy,
            useFactory: () => TwoFactorPlugin.nativeStrategy,
        },
        {
            provide: TWO_FACTOR_PLUGIN_OPTIONS,
            useFactory: (): TwoFactorPluginOptions => TwoFactorPlugin.options,
        },
    ],
    exports: [FactorStoreService, TwoFactorAuditService, TwoFactorPolicyService],
    shopApiExtensions: {
        schema: twoFactorSchema,
        resolvers: [...resolvers, ShopAccountSetupResolver],
    },
    adminApiExtensions: { schema: twoFactorSchema, resolvers },
    configuration: (config: RuntimeVendureConfig) => {
        const native = TwoFactorPlugin.nativeStrategy;
        const second = new TwoFactorAuthenticationStrategy();
        const swap = <T extends { name: string }>(strategies: T[], guarded: T): T[] => [
            ...strategies.filter(strategy => strategy.name !== guarded.name),
            guarded,
        ];
        config.authOptions.shopAuthenticationStrategy = [
            ...swap(config.authOptions.shopAuthenticationStrategy, native),
            second,
        ];
        config.authOptions.adminAuthenticationStrategy = [
            ...swap(config.authOptions.adminAuthenticationStrategy, native),
            second,
        ];
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createTwoFactorCleanupTask(TwoFactorPlugin.options),
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class TwoFactorPlugin {
    static options: TwoFactorPluginOptions;
    static readonly nativeStrategy = new TwoFactorNativeAuthenticationStrategy();

    static init(options: TwoFactorPluginOptions): Type<TwoFactorPlugin> {
        this.options = options;
        return TwoFactorPlugin;
    }
}
