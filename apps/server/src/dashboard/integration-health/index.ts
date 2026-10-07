import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

import { IntegrationHealthPage } from './integration-health-page.js';
import { isLagOverThreshold } from './stream-health-view.js';

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
