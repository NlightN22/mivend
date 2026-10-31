import { graphql } from '@vendure/dashboard';

export const consistencyReportListDocument = graphql(`
    query ConsistencyReportsForDashboard($options: ConsistencyReportListOptions) {
        consistencyReports(options: $options) {
            items {
                id
                number
                source
                type
                severity
                entityType
                entityId
                expected
                actual
                details
                replayable
                occurrences
                firstDetectedAt
                lastDetectedAt
                resolvedAt
                status
            }
            totalItems
        }
    }
`);

export const consistencySourcesDocument = graphql(`
    query ConsistencySourcesForDashboard {
        consistencySources {
            source
            health
            healthDetail
            summary
            lastFinishedAt
            lastPolledAt
            lastSuccessAt
            localOpenByType
            localOpenBySeverity
            coveredEntityTypes
            ignoredEntityTypes {
                entityType
                reason
            }
        }
    }
`);
