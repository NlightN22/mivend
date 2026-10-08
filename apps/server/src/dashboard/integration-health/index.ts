import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

import { InboxIssuesPage } from './inbox-issues-page.js';
import { IntegrationHealthPage } from './integration-health-page.js';
import { INBOX_ISSUES_PATH, OUTBOUND_PROBLEMS_PATH } from './issue-links.js';
import { OutboundProblemsPage } from './outbound-problems-page.js';
import {
    isLagOverThreshold,
    isRejectedOrderCountOverThreshold,
    outboundTypesWith,
} from './stream-health-view.js';

// Lives under apps/server/src, not packages/plugins/*: see ../system-health/index.ts.
const kafkaLagAlertDocument = graphql(`
    query KafkaConsumerLagForAlert {
        integrationStreamHealth {
            streams {
                lag {
                    topic
                    totalLag
                }
            }
        }
    }
`);

const outboxAlertDocument = graphql(`
    query IntegrationOutboxForAlert {
        integrationOutboxHealth {
            eventType
            failed
            skipped
        }
    }
`);

const rejectedOrderAlertDocument = graphql(`
    query RejectedOrderCountForAlert {
        rejectedOrderCount
    }
`);

function outboxAlert(
    key: 'failed' | 'skipped',
    id: string,
    title: (n: number) => string,
): DashboardAlertDefinition<string[]> {
    return {
        id,
        check: async () => {
            try {
                const data = await api.query(outboxAlertDocument);
                return outboundTypesWith(data.integrationOutboxHealth, key);
            } catch {
                // Same fail-closed guard as kafkaLagAlert: never crash the shell for other extensions.
                return [];
            }
        },
        shouldShow: types => (types?.length ?? 0) > 0,
        severity: 'error',
        title: types => title((types ?? []).length),
        description: types => (types ?? []).join(', '),
        actions: [
            {
                label: 'View integration health',
                onClick: ({ dismiss }) => {
                    dismiss();
                    window.location.href = '/integration-health';
                },
            },
        ],
        recheckInterval: 60_000,
    };
}

export const outboxFailedAlert = outboxAlert(
    'failed',
    'integration-outbox-failed',
    n => `Outbound events gave up publishing (${n} event type(s))`,
);

export const outboxSkippedAlert = outboxAlert(
    'skipped',
    'integration-outbox-skipped',
    n => `Outbound events were skipped, never sent (${n} event type(s))`,
);

export const kafkaLagAlert: DashboardAlertDefinition<string[]> = {
    id: 'kafka-consumer-lag-high',
    check: async () => {
        try {
            const data = await api.query(kafkaLagAlertDocument);
            return data.integrationStreamHealth.streams
                .filter(st => isLagOverThreshold(st.lag?.totalLag ?? null))
                .map(st => st.lag!.topic);
        } catch {
            // A viewer lacking ManageErpIntegration (or a transient network error) must not
            // crash the dashboard shell — same fail-closed guard as system-health's own check().
            return [];
        }
    },
    shouldShow: topics => (topics?.length ?? 0) > 0,
    severity: 'warning',
    title: topics => `Kafka consumer lag is high on ${(topics ?? []).length} topic(s)`,
    description: topics => (topics ?? []).join(', '),
    actions: [
        {
            label: 'View integration health',
            onClick: ({ dismiss }) => {
                dismiss();
                window.location.href = '/integration-health';
            },
        },
    ],
    recheckInterval: 60_000,
};

export const rejectedOrdersAlert: DashboardAlertDefinition<number> = {
    id: 'erp-rejected-orders',
    check: async () => {
        try {
            const data = await api.query(rejectedOrderAlertDocument);
            return data.rejectedOrderCount;
        } catch {
            // Same fail-closed guard as the other checks above: never crash the shell.
            return 0;
        }
    },
    shouldShow: count => isRejectedOrderCountOverThreshold(count ?? 0),
    severity: 'error',
    title: count => `${count ?? 0} order(s) rejected by the ERP`,
    description: () => 'See the Rejected by ERP queue in the manager portal for the reasons.',
    actions: [
        {
            label: 'View integration health',
            onClick: ({ dismiss }) => {
                dismiss();
                window.location.href = '/integration-health';
            },
        },
    ],
    recheckInterval: 60_000,
};

defineDashboardExtension({
    alerts: [kafkaLagAlert, outboxFailedAlert, outboxSkippedAlert, rejectedOrdersAlert],
    routes: [
        {
            path: INBOX_ISSUES_PATH,
            component: route => InboxIssuesPage({ route }),
            navMenuItem: {
                sectionId: 'system',
                id: 'integration-inbox-issues',
                title: 'Inbox issues',
                url: INBOX_ISSUES_PATH,
                requiresPermission: 'ManageErpIntegration',
            },
        },
        {
            path: OUTBOUND_PROBLEMS_PATH,
            component: route => OutboundProblemsPage({ route }),
            navMenuItem: {
                sectionId: 'system',
                id: 'integration-outbound-problems',
                title: 'Outbound problems',
                url: OUTBOUND_PROBLEMS_PATH,
                requiresPermission: 'ManageErpIntegration',
            },
        },
        {
            path: '/integration-health',
            component: IntegrationHealthPage,
            navMenuItem: {
                sectionId: 'system',
                id: 'integration-health',
                title: 'Integration health',
                url: '/integration-health',
            },
        },
    ],
});
