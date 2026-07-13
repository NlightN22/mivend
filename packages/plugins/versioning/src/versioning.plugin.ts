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

    extend type Query {
        entityVersions(entityName: String!, entityId: ID!): [EntityVersion!]!
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
