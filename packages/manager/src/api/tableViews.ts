import { adminApi } from './client';
import {
    DeleteTableViewDocument,
    SaveTableViewDocument,
    SetTableViewDefaultDocument,
    TableViewsDocument,
    UpdateTableViewDocument,
    type SavedTableViewFieldsFragment,
    type SavedTableViewScope,
} from './generated/graphql';

export type SavedTableView = SavedTableViewFieldsFragment;
export type { SavedTableViewScope };

// Own personal views plus every team view of the list.
export async function fetchTableViews(pageKey: string): Promise<SavedTableView[]> {
    const result = await adminApi(TableViewsDocument, { pageKey });
    return result.tableViews;
}

export async function saveTableView(
    pageKey: string,
    name: string,
    filters: string,
    visibleColumns: string[],
    scope: SavedTableViewScope = 'PERSONAL',
): Promise<SavedTableView> {
    const result = await adminApi(SaveTableViewDocument, {
        pageKey,
        name,
        filters,
        visibleColumns,
        scope,
    });
    return result.saveTableView;
}

export interface TableViewPatch {
    name?: string;
    filters?: string;
    visibleColumns?: string[];
}

export async function updateTableView(
    id: string,
    patch: TableViewPatch,
): Promise<SavedTableView | null> {
    const result = await adminApi(UpdateTableViewDocument, { id, ...patch });
    return result.updateTableView;
}

export async function setTableViewDefault(
    id: string,
    isDefault: boolean,
): Promise<SavedTableView | null> {
    const result = await adminApi(SetTableViewDefaultDocument, { id, isDefault });
    return result.setTableViewDefault;
}

export async function deleteTableView(id: string): Promise<boolean> {
    const result = await adminApi(DeleteTableViewDocument, { id });
    return result.deleteTableView;
}
