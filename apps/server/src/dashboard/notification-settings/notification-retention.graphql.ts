import { graphql } from '@vendure/dashboard';

export const notificationRetentionListDocument = graphql(`
    query NotificationRetentionRulesForDashboard($options: NotificationRetentionRuleListOptions) {
        notificationRetentionRules(options: $options) {
            items {
                id
                createdAt
                updatedAt
                uuid
                sourceType
                readDays
                unreadDays
            }
            totalItems
        }
    }
`);

export const updateNotificationRetentionDocument = graphql(`
    mutation UpdateNotificationRetentionRuleFromDashboard(
        $id: ID!
        $input: NotificationRetentionRuleInput!
    ) {
        updateNotificationRetentionRule(id: $id, input: $input) {
            id
        }
    }
`);
