import { AccountRegistrationEvent, IdentifierChangeRequestEvent } from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';
import { EmailLanguage, resolveEmailLanguage } from './email-language';

export const EMAIL_SUBJECTS = {
    passwordReset: { en: 'Forgotten password reset', ru: 'Восстановление пароля' },
    emailVerification: {
        en: 'Please verify your email address',
        ru: 'Подтвердите адрес электронной почты',
    },
    emailAddressChange: {
        en: 'Please verify your change of email address',
        ru: 'Подтвердите новый адрес электронной почты',
    },
} satisfies Record<string, Record<EmailLanguage, string>>;

export function createEmailVerificationHandler(fallback: EmailLanguage) {
    return new EmailEventListener('email-verification')
        .on(AccountRegistrationEvent)
        .filter(event => !!event.user.getNativeAuthenticationMethod().identifier)
        .setRecipient(event => event.user.identifier)
        .setFrom('{{ fromAddress }}')
        .setSubject(
            event => EMAIL_SUBJECTS.emailVerification[resolveEmailLanguage(event.ctx, fallback)],
        )
        .setTemplateVars(event => ({
            emailLanguage: resolveEmailLanguage(event.ctx, fallback),
            verificationToken: event.user.getNativeAuthenticationMethod().verificationToken,
        }));
}

export function createEmailAddressChangeHandler(fallback: EmailLanguage) {
    return new EmailEventListener('email-address-change')
        .on(IdentifierChangeRequestEvent)
        .setRecipient(event => event.user.getNativeAuthenticationMethod().pendingIdentifier ?? '')
        .setFrom('{{ fromAddress }}')
        .setSubject(
            event => EMAIL_SUBJECTS.emailAddressChange[resolveEmailLanguage(event.ctx, fallback)],
        )
        .setTemplateVars(event => ({
            emailLanguage: resolveEmailLanguage(event.ctx, fallback),
            identifierChangeToken: event.user.getNativeAuthenticationMethod().identifierChangeToken,
        }));
}
