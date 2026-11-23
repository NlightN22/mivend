import { EmailPluginOptions } from '@vendure/email-plugin';
import {
    createEmailAddressChangeHandler,
    createEmailChangeNoticeHandler,
    createEmailConfirmationHandler,
    createEmailVerificationHandler,
} from './account-email-handlers';
import { EmailLanguage } from './email-language';
import { EmailSourceConfig } from './email-source';
import { createNewDeviceSignInHandler } from './new-device-email-handler';
import { PasswordResetUrls, createPasswordResetHandler } from './password-reset-handler';
import { createTwoFactorEmailHandlers } from './two-factor-email-handlers';

// urls holds the set-password pages, recoveryUrls the two-factor recovery pages, one base per audience.
export function createEmailHandlers(
    urls: PasswordResetUrls,
    recoveryUrls: PasswordResetUrls,
    fallback: EmailLanguage,
    sources: EmailSourceConfig,
): EmailPluginOptions['handlers'] {
    return [
        createEmailVerificationHandler(fallback, sources),
        createPasswordResetHandler(urls, fallback, sources),
        createEmailAddressChangeHandler(fallback, sources),
        createEmailConfirmationHandler(fallback, sources),
        createEmailChangeNoticeHandler(fallback, sources),
        ...createTwoFactorEmailHandlers(recoveryUrls, fallback, sources),
        createNewDeviceSignInHandler(fallback, sources),
    ];
}
