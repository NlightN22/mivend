import {
    createEmailAddressChangeHandler,
    createEmailVerificationHandler,
} from './account-email-handlers';
import { EmailLanguage } from './email-language';
import { PasswordResetUrls, createPasswordResetHandler } from './password-reset-handler';

export function createEmailHandlers(urls: PasswordResetUrls, fallback: EmailLanguage) {
    return [
        createEmailVerificationHandler(fallback),
        createPasswordResetHandler(urls, fallback),
        createEmailAddressChangeHandler(fallback),
    ];
}
