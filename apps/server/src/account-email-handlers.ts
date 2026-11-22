import { AccountRegistrationEvent, IdentifierChangeRequestEvent } from '@vendure/core';
import { EmailConfirmationRequestedEvent } from '@mivend/plugin-legal-documents';
import { EmailEventHandler, EmailEventListener, EventWithAsyncData } from '@vendure/email-plugin';
import { EmailLanguage, resolveEmailLanguage } from './email-language';
import {
    EmailSource,
    EmailSourceConfig,
    loadEmailSource,
    sourceTemplateVars,
} from './email-source';

interface SourceData {
    source: EmailSource;
}

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
    emailConfirmation: {
        en: 'Please confirm your email address',
        ru: 'Подтвердите адрес электронной почты',
    },
    twoFactorEnabled: {
        en: 'Two-factor authentication is on',
        ru: 'Двухфакторная аутентификация включена',
    },
    twoFactorChanged: {
        en: 'Your authenticator device was changed',
        ru: 'Устройство аутентификации заменено',
    },
    twoFactorRecovery: {
        en: 'Recover access to your authenticator',
        ru: 'Восстановление доступа к аутентификатору',
    },
    twoFactorRecoveryCompleted: {
        en: 'Access to your authenticator was recovered',
        ru: 'Доступ к аутентификатору восстановлен',
    },
    newDeviceSignIn: {
        en: 'New sign-in to your account',
        ru: 'Новый вход в вашу учётную запись',
    },
} satisfies Record<string, Record<EmailLanguage, string>>;

export function createEmailVerificationHandler(
    fallback: EmailLanguage,
    sources: EmailSourceConfig,
): EmailEventHandler<
    'email-verification',
    EventWithAsyncData<AccountRegistrationEvent, SourceData>
> {
    return new EmailEventListener('email-verification')
        .on(AccountRegistrationEvent)
        .filter(event => !!event.user.getNativeAuthenticationMethod().identifier)
        .setRecipient(event => event.user.identifier)
        .loadData(async ({ event, injector }) => ({
            source: await loadEmailSource(sources, injector, event),
        }))
        .setFrom('{{ sourceFrom }}')
        .setSubject(
            event =>
                event.data.source.subjectPrefix +
                EMAIL_SUBJECTS.emailVerification[resolveEmailLanguage(event.ctx, fallback)],
        )
        .setTemplateVars(event => ({
            ...sourceTemplateVars(event.data.source),
            emailLanguage: resolveEmailLanguage(event.ctx, fallback),
            verificationToken: event.user.getNativeAuthenticationMethod().verificationToken,
        }));
}

export function createEmailAddressChangeHandler(
    fallback: EmailLanguage,
    sources: EmailSourceConfig,
): EmailEventHandler<
    'email-address-change',
    EventWithAsyncData<IdentifierChangeRequestEvent, SourceData>
> {
    return new EmailEventListener('email-address-change')
        .on(IdentifierChangeRequestEvent)
        .setRecipient(event => event.user.getNativeAuthenticationMethod().pendingIdentifier ?? '')
        .loadData(async ({ event, injector }) => ({
            source: await loadEmailSource(sources, injector, event),
        }))
        .setFrom('{{ sourceFrom }}')
        .setSubject(
            event =>
                event.data.source.subjectPrefix +
                EMAIL_SUBJECTS.emailAddressChange[resolveEmailLanguage(event.ctx, fallback)],
        )
        .setTemplateVars(event => ({
            ...sourceTemplateVars(event.data.source),
            emailLanguage: resolveEmailLanguage(event.ctx, fallback),
            identifierChangeToken: event.user.getNativeAuthenticationMethod().identifierChangeToken,
        }));
}

export function createEmailConfirmationHandler(
    fallback: EmailLanguage,
    sources: EmailSourceConfig,
): EmailEventHandler<
    'email-confirmation',
    EventWithAsyncData<EmailConfirmationRequestedEvent, SourceData>
> {
    return new EmailEventListener('email-confirmation')
        .on(EmailConfirmationRequestedEvent)
        .setRecipient(event => event.emailAddress)
        .loadData(async ({ event, injector }) => ({
            source: await loadEmailSource(sources, injector, event),
        }))
        .setFrom('{{ sourceFrom }}')
        .setSubject(
            event =>
                event.data.source.subjectPrefix +
                EMAIL_SUBJECTS.emailConfirmation[resolveEmailLanguage(event.ctx, fallback)],
        )
        .setTemplateVars(event => ({
            ...sourceTemplateVars(event.data.source),
            emailLanguage: resolveEmailLanguage(event.ctx, fallback),
            confirmationToken: event.token,
        }));
}
