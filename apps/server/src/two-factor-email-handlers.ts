import { RequestContext, TransactionalConnection, Type, User, VendureEvent } from '@vendure/core';
import { EmailEventHandler, EmailEventListener, EventWithAsyncData } from '@vendure/email-plugin';
import {
    TwoFactorChangedEvent,
    TwoFactorEnabledEvent,
    TwoFactorRecoveryCompletedEvent,
    TwoFactorRecoveryRequestedEvent,
} from '@mivend/plugin-two-factor';
import { EMAIL_SUBJECTS } from './account-email-handlers';
import { EmailLanguage, resolveEmailLanguage } from './email-language';
import {
    EmailSource,
    EmailSourceConfig,
    isStaffUser,
    loadEmailSource,
    resolveEmailSource,
    sourceTemplateVars,
} from './email-source';
import { PasswordResetUrls } from './password-reset-handler';

interface UserEvent {
    ctx: RequestContext;
    user: User;
}

interface SourceData {
    source: EmailSource;
}

type Subjects = Record<EmailLanguage, string>;

function notice<E extends VendureEvent & UserEvent>(
    type: string,
    event: Type<E>,
    subjects: Subjects,
    fallback: EmailLanguage,
    sources: EmailSourceConfig,
): EmailEventHandler<string, EventWithAsyncData<E, SourceData>> {
    return new EmailEventListener(type)
        .on(event)
        .setRecipient(e => e.user.identifier)
        .loadData(async ({ event, injector }) => ({
            source: await loadEmailSource(sources, injector, event),
        }))
        .setFrom('{{ sourceFrom }}')
        .setSubject(
            e => e.data.source.subjectPrefix + subjects[resolveEmailLanguage(e.ctx, fallback)],
        )
        .setTemplateVars(e => ({
            ...sourceTemplateVars(e.data.source),
            emailLanguage: resolveEmailLanguage(e.ctx, fallback),
        }));
}

export function createTwoFactorEmailHandlers(
    urls: PasswordResetUrls,
    fallback: EmailLanguage,
    sources: EmailSourceConfig,
): (
    | EmailEventHandler<string, EventWithAsyncData<TwoFactorEnabledEvent, SourceData>>
    | EmailEventHandler<
          'two-factor-recovery',
          EventWithAsyncData<
              TwoFactorRecoveryRequestedEvent,
              { twoFactorRecoveryUrl: string } & SourceData
          >
      >
)[] {
    const recovery = new EmailEventListener('two-factor-recovery')
        .on(TwoFactorRecoveryRequestedEvent)
        .loadData(async ({ event, injector }) => {
            const staff = await isStaffUser(
                injector.get(TransactionalConnection),
                event.ctx,
                event.user.id,
            );
            return {
                twoFactorRecoveryUrl: staff ? urls.staff : urls.customer,
                source: resolveEmailSource(sources, event.ctx, staff),
            };
        })
        .setRecipient(e => e.user.identifier)
        .setFrom('{{ sourceFrom }}')
        .setSubject(
            e =>
                e.data.source.subjectPrefix +
                EMAIL_SUBJECTS.twoFactorRecovery[resolveEmailLanguage(e.ctx, fallback)],
        )
        .setTemplateVars(e => ({
            ...sourceTemplateVars(e.data.source),
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
            sources,
        ),
        notice(
            'two-factor-changed',
            TwoFactorChangedEvent,
            EMAIL_SUBJECTS.twoFactorChanged,
            fallback,
            sources,
        ),
        recovery,
        notice(
            'two-factor-recovery-completed',
            TwoFactorRecoveryCompletedEvent,
            EMAIL_SUBJECTS.twoFactorRecoveryCompleted,
            fallback,
            sources,
        ),
    ];
}
