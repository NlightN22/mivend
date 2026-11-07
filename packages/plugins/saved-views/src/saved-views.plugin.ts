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
        scope: SavedTableViewScope!
        isDefault: Boolean!
        createdAt: DateTime!
    }

    enum SavedTableViewScope {
        PERSONAL
        SHARED
    }

    extend type Query {
        tableViews(pageKey: String!): [SavedTableView!]!
    }

    extend type Mutation {
        saveTableView(
            pageKey: String!
            name: String!
            filters: String!
            visibleColumns: [String!]!
            scope: SavedTableViewScope
        ): SavedTableView!
        updateTableView(
            id: ID!
            name: String
            filters: String
            visibleColumns: [String!]
        ): SavedTableView
        setTableViewDefault(id: ID!, isDefault: Boolean!): SavedTableView
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
