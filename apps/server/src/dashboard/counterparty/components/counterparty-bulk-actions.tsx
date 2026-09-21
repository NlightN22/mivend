import { useState } from 'react';
import { BulkActionComponent, DataTableBulkActionItem, usePaginatedList } from '@vendure/dashboard';
import { UserRoundIcon, LinkIcon, UnlinkIcon } from 'lucide-react';

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

// "Link to Customer"/"Unlink from Customer" are issue #120's own activation/deactivation
// mutations, not yet built — issue #133 asks to wire the affordance but leave it disabled with a
// note rather than duplicate that work here.
export const LinkToCustomerBulkAction: BulkActionComponent<any> = () => {
    return (
        <DataTableBulkActionItem
            onClick={() => {}}
            label="Link to Customer (coming with #120)"
            icon={LinkIcon}
            disabled
            closeOnClick={false}
        />
    );
};

export const UnlinkFromCustomerBulkAction: BulkActionComponent<any> = () => {
    return (
        <DataTableBulkActionItem
            onClick={() => {}}
            label="Unlink from Customer (coming with #120)"
            icon={UnlinkIcon}
            disabled
            closeOnClick={false}
        />
    );
};
