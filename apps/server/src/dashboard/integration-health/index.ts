import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

import { IntegrationHealthPage } from './integration-health-page.js';

// See ../system-health/index.ts's own doc comment for why this file sits under
// apps/server/src instead of a packages/plugins/* package (pnpm-workspace-symlink
// dashboard-discovery limitation).
const kafkaLagAlertDocument = graphql(`
    query KafkaConsumerLagForAlert {
        kafkaConsumerLag {
            topic
            partitions {
                lag
            }
        }
    }
`);

const LAG_ALERT_THRESHOLD = 1000n;

export const kafkaLagAlert: DashboardAlertDefinition<string[]> = {
    id: 'kafka-consumer-lag-high',
    check: async () => {
        try {
            const data = await api.query(kafkaLagAlertDocument);
            const topics = data.kafkaConsumerLag ?? [];
            return topics
                .filter(t =>
                    t.partitions.some(p => p.lag !== null && BigInt(p.lag) > LAG_ALERT_THRESHOLD),
                )
                .map(t => t.topic);
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

defineDashboardExtension({
    alerts: [kafkaLagAlert],
    routes: [
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
