import { NewDeviceSignInEvent } from '@mivend/plugin-session-management';
import { EmailEventHandler, EmailEventListener, EventWithAsyncData } from '@vendure/email-plugin';
import { EMAIL_SUBJECTS } from './account-email-handlers';
import { EmailLanguage, resolveEmailLanguage } from './email-language';
import {
    EmailSource,
    EmailSourceConfig,
    loadEmailSource,
    sourceTemplateVars,
} from './email-source';

export function createNewDeviceSignInHandler(
    fallback: EmailLanguage,
    sources: EmailSourceConfig,
): EmailEventHandler<
    'new-device-sign-in',
    EventWithAsyncData<NewDeviceSignInEvent, { source: EmailSource }>
> {
    return new EmailEventListener('new-device-sign-in')
        .on(NewDeviceSignInEvent)
        .setRecipient(e => e.user.identifier)
        .loadData(async ({ event, injector }) => ({
            source: await loadEmailSource(sources, injector, event),
        }))
        .setFrom('{{ sourceFrom }}')
        .setSubject(
            e =>
                e.data.source.subjectPrefix +
                EMAIL_SUBJECTS.newDeviceSignIn[resolveEmailLanguage(e.ctx, fallback)],
        )
        .setTemplateVars(e => ({
            ...sourceTemplateVars(e.data.source),
            emailLanguage: resolveEmailLanguage(e.ctx, fallback),
            deviceLabel: e.deviceLabel,
            signedInAt: `${e.signedInAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
        }));
}
