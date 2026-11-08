import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { RuntimeVendureConfig, Type } from '@vendure/core';

import { SignInProtectionResolver } from './api/sign-in-protection.resolver';
import { signInProtectionSchema } from './api/sign-in-protection.schema';
import { BreachCheckedPasswordValidationStrategy } from './breach/breach-checked-password-validation';
import { PasswordBreachService } from './breach/password-breach.service';
import { CaptchaService } from './captcha/captcha.service';
import { SignInThrottle } from './entities/sign-in-throttle.entity';
import { PasswordChangeFlagSubscriber } from './password-change-flag.subscriber';
import { SignInGuardService } from './sign-in-guard.service';
import { SignInThrottleService } from './sign-in-throttle.service';
import { ThrottleStoreService } from './throttle-store.service';
import { createThrottleCleanupTask } from './throttle-cleanup.scheduled-task';
import { PASSWORD_CHANGE_REQUIRED_FIELD, SIGN_IN_PROTECTION_OPTIONS } from './types';
import type { SignInProtectionOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [SignInThrottle],
    providers: [
        ThrottleStoreService,
        SignInThrottleService,
        CaptchaService,
        PasswordBreachService,
        SignInGuardService,
        {
            provide: SIGN_IN_PROTECTION_OPTIONS,
            useFactory: (): SignInProtectionOptions => SignInProtectionPlugin.options,
        },
    ],
    exports: [SignInThrottleService, SignInGuardService],
    shopApiExtensions: { schema: signInProtectionSchema, resolvers: [SignInProtectionResolver] },
    adminApiExtensions: { schema: signInProtectionSchema, resolvers: [SignInProtectionResolver] },
    configuration: (config: RuntimeVendureConfig) => {
        const { breach } = SignInProtectionPlugin.options;
        config.customFields.User = [
            ...(config.customFields.User ?? []),
            {
                name: PASSWORD_CHANGE_REQUIRED_FIELD,
                type: 'boolean',
                defaultValue: false,
                nullable: false,
                readonly: true,
                public: true,
                label: [{ languageCode: 'en' as never, value: 'Password change required' }],
            },
        ];
        const subscribers = config.dbConnectionOptions.subscribers;
        config.dbConnectionOptions = {
            ...config.dbConnectionOptions,
            subscribers: [
                ...(Array.isArray(subscribers) ? subscribers : []),
                PasswordChangeFlagSubscriber,
            ],
        };
        if (breach.checker) {
            config.authOptions.passwordValidationStrategy =
                new BreachCheckedPasswordValidationStrategy(
                    config.authOptions.passwordValidationStrategy,
                    breach.checker,
                );
        }
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createThrottleCleanupTask(SignInProtectionPlugin.options),
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class SignInProtectionPlugin {
    static options: SignInProtectionOptions;

    static init(options: SignInProtectionOptions): Type<SignInProtectionPlugin> {
        this.options = options;
        return SignInProtectionPlugin;
    }
}
