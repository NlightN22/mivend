import {
    createEmailAddressChangeHandler,
    createEmailVerificationHandler,
} from './account-email-handlers';
import { EmailLanguage } from './email-language';
import { PasswordResetUrls, createPasswordResetHandler } from './password-reset-handler';
import { createTwoFactorEmailHandlers } from './two-factor-email-handlers';

// urls holds the set-password pages, recoveryUrls the two-factor recovery pages, one base per audience.
export function createEmailHandlers(
    urls: PasswordResetUrls,
    recoveryUrls: PasswordResetUrls,
    fallback: EmailLanguage,
) {
    return [
        createEmailVerificationHandler(fallback),
        createPasswordResetHandler(urls, fallback),
        createEmailAddressChangeHandler(fallback),
        ...createTwoFactorEmailHandlers(recoveryUrls, fallback),
    ];
}
