import { adminApi } from './client';
import {
    DeleteTableViewDocument,
    MyTableViewsDocument,
    SaveTableViewDocument,
} from './generated/graphql';

export interface SavedTableView {
    id: string;
    name: string;
    filters: string;
    visibleColumns: string[];
}

export async function fetchMyTableViews(pageKey: string): Promise<SavedTableView[]> {
    const result = await adminApi(MyTableViewsDocument, { pageKey });
    return result.myTableViews;
}

export async function saveTableView(
    pageKey: string,
    name: string,
    filters: string,
    visibleColumns: string[],
): Promise<SavedTableView> {
    const result = await adminApi(SaveTableViewDocument, {
        pageKey,
        name,
        filters,
        visibleColumns,
    });
    return result.saveTableView;
}

export async function deleteTableView(id: string): Promise<boolean> {
    const result = await adminApi(DeleteTableViewDocument, { id });
    return result.deleteTableView;
}
