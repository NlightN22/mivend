import { useState } from 'react';
import {
    api,
    BulkActionComponent,
    DataTableBulkActionItem,
    toast,
    usePaginatedList,
} from '@vendure/dashboard';
import { LinkIcon, UnlinkIcon, UserRoundIcon } from 'lucide-react';

import { applyCounterpartyPortalAccessChangesDocument } from '../counterparty.graphql.js';
import { useCounterpartyListFilter } from '../counterparty-list-filter-context.js';
import { shouldOfferAllMatching } from '../counterparty-list-variables.js';
import { AssignManagerDialog } from './assign-manager-dialog.js';

export const AssignManagerBulkAction: BulkActionComponent<any> = ({ selection, table }) => {
    const { refetchPaginatedList } = usePaginatedList();
    const [dialogOpen, setDialogOpen] = useState(false);
    const filter = useCounterpartyListFilter();
    const totalItems = table.getRowCount();
    const allMatching = shouldOfferAllMatching(
        table.getIsAllPageRowsSelected(),
        selection.length,
        totalItems,
    )
        ? { filter, totalItems }
        : undefined;

    return (
        <>
            <DataTableBulkActionItem
                requiresPermission={['ReadCustomer']}
                onClick={() => setDialogOpen(true)}
                label="Assign manager"
                icon={UserRoundIcon}
                closeOnClick={false}
            />
            <AssignManagerDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                counterpartyIds={selection.map((s: { id: string }) => s.id)}
                allMatching={allMatching}
                onSuccess={() => {
                    refetchPaginatedList();
                    table.resetRowSelection();
                }}
            />
        </>
    );
};

// One batch call; per-row results summarized in a single toast, list refetched to show failures.
async function applyPortalAccessChanges(
    counterpartyIds: string[],
    action: 'activate' | 'deactivate',
    refetchPaginatedList: () => void,
    resetSelection: () => void,
): Promise<void> {
    const result = await api.mutate(applyCounterpartyPortalAccessChangesDocument, {
        changes: counterpartyIds.map(counterpartyId => ({ counterpartyId, action })),
    });
    const changes = result.applyCounterpartyPortalAccessChanges;
    const failed = changes.filter(c => !c.success);
    if (failed.length === 0) {
        toast.success(
            action === 'activate'
                ? `Linked ${changes.length} counterpart${changes.length === 1 ? 'y' : 'ies'} to a portal Customer.`
                : `Unlinked ${changes.length} counterpart${changes.length === 1 ? 'y' : 'ies'} from their portal Customer.`,
        );
    } else {
        toast.error(
            `${failed.length}/${changes.length} failed: ${failed
                .slice(0, 3)
                .map(c => c.error)
                .join('; ')}${failed.length > 3 ? '…' : ''}`,
        );
    }
    refetchPaginatedList();
    resetSelection();
}

export const LinkToCustomerBulkAction: BulkActionComponent<any> = ({ selection, table }) => {
    const { refetchPaginatedList } = usePaginatedList();
    return (
        <DataTableBulkActionItem
            requiresPermission={['ManageCounterpartyPortalAccess']}
            onClick={() =>
                void applyPortalAccessChanges(
                    selection.map((s: { id: string }) => s.id),
                    'activate',
                    refetchPaginatedList,
                    () => table.resetRowSelection(),
                )
            }
            label="Link to Customer"
            icon={LinkIcon}
            closeOnClick={true}
        />
    );
};

export const UnlinkFromCustomerBulkAction: BulkActionComponent<any> = ({ selection, table }) => {
    const { refetchPaginatedList } = usePaginatedList();
    return (
        <DataTableBulkActionItem
            requiresPermission={['ManageCounterpartyPortalAccess']}
            onClick={() =>
                void applyPortalAccessChanges(
                    selection.map((s: { id: string }) => s.id),
                    'deactivate',
                    refetchPaginatedList,
                    () => table.resetRowSelection(),
                )
            }
            label="Unlink from Customer"
            icon={UnlinkIcon}
            closeOnClick={true}
        />
    );
};
