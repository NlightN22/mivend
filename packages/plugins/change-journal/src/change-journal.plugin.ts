import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import type { RuntimeVendureConfig, Type } from '@vendure/core';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { SessionManagementPlugin } from '@mivend/plugin-session-management';
import { VersioningPlugin } from '@mivend/plugin-versioning';

import { ChangeJournalResolver } from './api/change-journal.resolver';
import { changeJournalAdminSchema } from './api/change-journal.schema';
import { createChangeJournalCleanupTask } from './change-journal-cleanup.scheduled-task';
import { ChangeJournalInterceptor } from './change-journal.interceptor';
import { ChangeJournalService } from './change-journal.service';
import { ChangeJournalSubscriber } from './change-journal.subscriber';
import type { ChangeJournalPluginOptions } from './change-journal.types';
import { ChangeJournalEntry } from './entities/change-journal-entry.entity';
import { labelScheduledTasks } from './scheduled-task-source';

// Listed after every plugin that registers scheduled tasks, so all of them get a source label.
@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin, SessionManagementPlugin, VersioningPlugin],
    entities: [ChangeJournalEntry],
    providers: [
        ChangeJournalService,
        { provide: 'APP_INTERCEPTOR', useClass: ChangeJournalInterceptor },
    ],
    exports: [ChangeJournalService],
    adminApiExtensions: {
        schema: changeJournalAdminSchema,
        resolvers: [ChangeJournalResolver],
    },
    configuration: (config: RuntimeVendureConfig): RuntimeVendureConfig => {
        const existing = config.dbConnectionOptions.subscribers;
        config.dbConnectionOptions = {
            ...config.dbConnectionOptions,
            subscribers: [...(Array.isArray(existing) ? existing : []), ChangeJournalSubscriber],
        };
        config.schedulerOptions.tasks = labelScheduledTasks([
            ...(config.schedulerOptions.tasks ?? []),
            createChangeJournalCleanupTask(ChangeJournalPlugin.options),
        ]);
        return config;
    },
    compatibility: '>0.0.0',
})
export class ChangeJournalPlugin {
    static options: ChangeJournalPluginOptions = {};

    static init(options: ChangeJournalPluginOptions): Type<ChangeJournalPlugin> {
        this.options = options;
        return ChangeJournalPlugin;
    }
}
