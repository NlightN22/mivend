import { useState } from 'react';
import { api, BulkActionComponent, DataTableBulkActionItem, toast, usePaginatedList } from '@vendure/dashboard';
import { LinkIcon, UnlinkIcon, UserRoundIcon } from 'lucide-react';

import { applyCounterpartyPortalAccessChangesDocument } from '../counterparty.graphql.js';
import { AssignManagerDialog } from './assign-manager-dialog.js';

// "Assign manager" reuses reassignCounterpartyManager (already implemented, see the dialog).
export const AssignManagerBulkAction: BulkActionComponent<any> = ({ selection, table }) => {
    const { refetchPaginatedList } = usePaginatedList();
    const [dialogOpen, setDialogOpen] = useState(false);

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
                onSuccess={() => {
                    refetchPaginatedList();
                    table.resetRowSelection();
                }}
            />
        </>
    );
};

// Link to Customer / Unlink from Customer — issue #120's own applyCounterpartyPortalAccessChanges
// batch mutation, now that it exists (superseding the earlier disabled placeholder shipped with
// #133, which leaked its own "(coming with #120)" issue number into the UI — see that fix's own
// history). Each row is reported independently by the mutation; toast summarizes success/failure
// counts rather than one toast per row, and always refetches so partial failures are visible in
// the list's own Status column immediately, not just in the toast.
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
