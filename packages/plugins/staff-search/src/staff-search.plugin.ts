import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { StaffSearchRegistry } from './staff-search.registry';
import { StaffSearchResolver } from './staff-search.resolver';
import { StaffSearchService } from './staff-search.service';

const adminApiSchema = gql`
    type GlobalSearchItem {
        id: ID!
        number: String!
        title: String!
        subtitle: String
        status: String
        counterpartyId: ID
    }

    type GlobalSearchGroup {
        kind: String!
        items: [GlobalSearchItem!]!
    }

    extend type Query {
        globalSearch(term: String!, limitPerKind: Int): [GlobalSearchGroup!]!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [StaffSearchRegistry, StaffSearchService],
    exports: [StaffSearchRegistry],
    adminApiExtensions: { schema: adminApiSchema, resolvers: [StaffSearchResolver] },
    compatibility: '>0.0.0',
})
export class StaffSearchPlugin {}
