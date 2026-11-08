import { RequestContext, TransactionalConnection, Type, User, VendureEvent } from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';
import {
    TwoFactorChangedEvent,
    TwoFactorEnabledEvent,
    TwoFactorRecoveryCompletedEvent,
    TwoFactorRecoveryRequestedEvent,
} from '@mivend/plugin-two-factor';
import { EMAIL_SUBJECTS } from './account-email-handlers';
import { EmailLanguage, resolveEmailLanguage } from './email-language';
import { PasswordResetUrls, isStaffUser } from './password-reset-handler';

interface UserEvent {
    ctx: RequestContext;
    user: User;
}

type Subjects = Record<EmailLanguage, string>;

function notice<E extends VendureEvent & UserEvent>(
    type: string,
    event: Type<E>,
    subjects: Subjects,
    fallback: EmailLanguage,
) {
    return new EmailEventListener(type)
        .on(event)
        .setRecipient(e => e.user.identifier)
        .setFrom('{{ fromAddress }}')
        .setSubject(e => subjects[resolveEmailLanguage(e.ctx, fallback)])
        .setTemplateVars(e => ({ emailLanguage: resolveEmailLanguage(e.ctx, fallback) }));
}

export function createTwoFactorEmailHandlers(urls: PasswordResetUrls, fallback: EmailLanguage) {
    const recovery = new EmailEventListener('two-factor-recovery')
        .on(TwoFactorRecoveryRequestedEvent)
        .loadData(async ({ event, injector }) => {
            const staff = await isStaffUser(
                injector.get(TransactionalConnection),
                event.ctx,
                event.user.id,
            );
            return { twoFactorRecoveryUrl: staff ? urls.staff : urls.customer };
        })
        .setRecipient(e => e.user.identifier)
        .setFrom('{{ fromAddress }}')
        .setSubject(e => EMAIL_SUBJECTS.twoFactorRecovery[resolveEmailLanguage(e.ctx, fallback)])
        .setTemplateVars(e => ({
            emailLanguage: resolveEmailLanguage(e.ctx, fallback),
            twoFactorRecoveryToken: e.token,
            twoFactorRecoveryUrl: e.data.twoFactorRecoveryUrl,
        }));
    return [
        notice(
            'two-factor-enabled',
            TwoFactorEnabledEvent,
            EMAIL_SUBJECTS.twoFactorEnabled,
            fallback,
        ),
        notice(
            'two-factor-changed',
            TwoFactorChangedEvent,
            EMAIL_SUBJECTS.twoFactorChanged,
            fallback,
        ),
        recovery,
        notice(
            'two-factor-recovery-completed',
            TwoFactorRecoveryCompletedEvent,
            EMAIL_SUBJECTS.twoFactorRecoveryCompleted,
            fallback,
        ),
    ];
}
