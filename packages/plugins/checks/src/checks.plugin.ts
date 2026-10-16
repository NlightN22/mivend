import { PluginCommonModule, RuntimeVendureConfig, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { CheckPolicyService } from './check-policy.service';
import { CheckRegistry } from './check-registry';
import { CheckPolicy } from './entities/check-policy.entity';
import { CheckPolicyHistory } from './entities/check-policy-history.entity';
import { CheckResult } from './entities/check-result.entity';
import { CheckStaleRequest } from './entities/check-stale-request.entity';
import { CheckStaleRequestService } from './check-stale-request.service';
import { CheckStaleRequestWriter } from './check-stale-request.writer';
import { createCheckStaleRequestTask } from './check-stale-request.scheduled-task';
import { ChecksResolver } from './checks.resolver';
import { ChecksService } from './checks.service';

const adminApiSchema = gql`
    type CheckDefinition {
        code: String!
        subjectType: String!
        stages: [String!]!
        description: String!
        defaultConsequence: String!
        allowedConsequences: [String!]!
    }

    type CheckPolicy {
        id: ID!
        uuid: String!
        checkCode: String!
        stage: String!
        consequence: String!
        recipient: String
        enabled: Boolean!
        updatedAt: DateTime!
    }

    type CheckResult {
        id: ID!
        subjectType: String!
        subjectId: String!
        checkCode: String!
        stage: String
        lineRef: String
        severity: String!
        messageKey: String!
        facts: JSON!
        dataVersion: String
        computedAt: DateTime!
        stale: Boolean!
    }

    input UpdateCheckPolicyInput {
        checkCode: String!
        stage: String!
        consequence: String!
        recipient: String
        enabled: Boolean!
    }

    extend type Query {
        checkResults(subjectType: String!, subjectId: String!): [CheckResult!]!
        checkDefinitions(subjectType: String): [CheckDefinition!]!
        checkPolicies(subjectType: String): [CheckPolicy!]!
    }

    extend type Mutation {
        updateCheckPolicy(input: UpdateCheckPolicyInput!): CheckPolicy!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [CheckPolicy, CheckPolicyHistory, CheckResult, CheckStaleRequest],
    providers: [
        CheckRegistry,
        CheckPolicyService,
        ChecksService,
        CheckStaleRequestWriter,
        CheckStaleRequestService,
    ],
    exports: [
        CheckRegistry,
        CheckPolicyService,
        ChecksService,
        CheckStaleRequestWriter,
        CheckStaleRequestService,
    ],
    configuration: (config: RuntimeVendureConfig) => {
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createCheckStaleRequestTask(),
        ];
        return config;
    },
    adminApiExtensions: { schema: adminApiSchema, resolvers: [ChecksResolver] },
    compatibility: '>0.0.0',
})
export class ChecksPlugin {}
