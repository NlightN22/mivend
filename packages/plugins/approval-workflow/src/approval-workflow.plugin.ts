import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';
import { AccessControlPlugin } from '@mivend/plugin-access-control';

import { ApprovalRequest } from './entities/approval-request.entity';
import { ApprovalStep } from './entities/approval-step.entity';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { ApprovalRequestService } from './approval-request.service';
import { ApprovalStepService } from './approval-step.service';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { ApprovalRequestResolver, WorkflowDefinitionResolver } from './approval-workflow.resolver';

const adminApiSchema = gql`
    type ApprovalStep {
        id: ID!
        stepIndex: Int!
        requiredRole: String!
        approverAdministratorId: String
        wasEscalated: Boolean!
        escalatedByAdministratorId: String
        escalatedToAdministratorId: String
        decision: String
        comment: String
        decidedAt: DateTime
    }

    type ApprovalRequest {
        id: ID!
        requestType: String!
        payload: String!
        status: String!
        currentStepIndex: Int!
        requestedByAdministratorId: String
        createdAt: DateTime!
        decidedAt: DateTime
        steps: [ApprovalStep!]!
        currentStepRole: String
        stepRoles: [String!]!
        totalSteps: Int!
        escalatesTo: [String!]!
    }

    type ApprovalRequestsSummary {
        pendingCount: Int!
        recent: [ApprovalRequest!]!
    }

    type ApprovalRequestList {
        items: [ApprovalRequest!]!
        totalItems: Int!
    }

    input ApprovalListOptions {
        take: Int
        skip: Int
        search: String
        requestType: String
        status: String
        statuses: [String!]
    }

    type ApprovalsInbox {
        awaitingMyDecision: ApprovalRequestList!
        allInvolved: ApprovalRequestList!
    }

    type WorkflowDefinition {
        id: ID!
        requestType: String!
        displayName: String!
        stepsJson: String!
    }

    input WorkflowStepInput {
        order: Int!
        role: String!
        requiredPermission: String!
        escalatesTo: [String!]!
    }

    extend type Query {
        approvalRequest(id: ID!): ApprovalRequest
        myApprovalRequestsSummary(recentLimit: Int): ApprovalRequestsSummary!
        pendingPriceAdjustmentOrderIds: [String!]!
        priceAdjustmentRequestsForOrder(orderId: ID!): [ApprovalRequest!]!
        approvalRequestsByType(
            requestType: String!
            options: ApprovalListOptions
        ): ApprovalRequestList!
        myApprovalsInbox(
            awaitingOptions: ApprovalListOptions
            allInvolvedOptions: ApprovalListOptions
        ): ApprovalsInbox!
    }

    extend type Mutation {
        createApprovalRequest(requestType: String!, payload: String!): ApprovalRequest!
        decideApprovalRequest(requestId: ID!, decision: String!, comment: String): ApprovalRequest!
        escalateApprovalRequest(requestId: ID!, escalateToAdministratorId: ID!): ApprovalRequest!
        upsertWorkflowDefinition(
            requestType: String!
            displayName: String!
            steps: [WorkflowStepInput!]!
        ): WorkflowDefinition!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin],
    entities: [ApprovalRequest, ApprovalStep, WorkflowDefinition],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [ApprovalRequestResolver, WorkflowDefinitionResolver],
    },
    providers: [ApprovalRequestService, ApprovalStepService, WorkflowDefinitionService],
    exports: [ApprovalRequestService, WorkflowDefinitionService],
    compatibility: '>0.0.0',
})
export class ApprovalWorkflowPlugin {}
