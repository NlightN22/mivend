import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';
import { AccessControlPlugin } from '@mivend/plugin-access-control';

import { EntityVersion } from './entities/entity-version.entity';
import { VersioningResolver } from './versioning.resolver';
import { VersioningService } from './versioning.service';

const adminApiSchema = gql`
    type EntityVersion {
        id: ID!
        entityName: String!
        entityId: String!
        action: String!
        changedFields: String
        administratorId: String
        comment: String
        createdAt: DateTime!
    }

    input EntityRefInput {
        entityName: String!
        entityId: ID!
    }

    type EntityVersionList {
        items: [EntityVersion!]!
        totalItems: Int!
    }

    input EntityVersionListOptions {
        take: Int
        skip: Int
        action: String
        entityName: String
        administratorId: ID
        "True to filter to system-initiated changes only (administratorId IS NULL) — mutually exclusive with administratorId."
        system: Boolean
        createdAfter: DateTime
    }

    extend type Query {
        entityVersions(entityName: String!, entityId: ID!): [EntityVersion!]!
        entityVersionsForEntities(
            refs: [EntityRefInput!]!
            options: EntityVersionListOptions
        ): EntityVersionList!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin],
    entities: [EntityVersion],
    providers: [VersioningService],
    exports: [VersioningService],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [VersioningResolver],
    },
    compatibility: '>0.0.0',
})
export class VersioningPlugin {}
