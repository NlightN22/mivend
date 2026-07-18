import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { SavedTableView } from './entities/saved-table-view.entity';
import { SavedViewsResolver } from './saved-views.resolver';
import { SavedViewsService } from './saved-views.service';

const adminApiSchema = gql`
    type SavedTableView {
        id: ID!
        pageKey: String!
        name: String!
        filters: String!
        visibleColumns: [String!]!
        createdAt: DateTime!
    }

    extend type Query {
        myTableViews(pageKey: String!): [SavedTableView!]!
    }

    extend type Mutation {
        saveTableView(
            pageKey: String!
            name: String!
            filters: String!
            visibleColumns: [String!]!
        ): SavedTableView!
        deleteTableView(id: ID!): Boolean!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [SavedTableView],
    providers: [SavedViewsService],
    exports: [SavedViewsService],
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [SavedViewsResolver],
    },
    compatibility: '>0.0.0',
})
export class SavedViewsPlugin {}
