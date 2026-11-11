import { useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    api,
    BulkActionComponent,
    DataTableBulkActionItem,
    toast,
    usePaginatedList,
} from '@vendure/dashboard';
import { TrashIcon } from 'lucide-react';

import { deleteLegalNameAbbreviationDocument } from './legal-name-abbreviations.graphql.js';

export const DeleteAbbreviationsBulkAction: BulkActionComponent<any> = ({ selection, table }) => {
    const { refetchPaginatedList } = usePaginatedList();
    const [confirmOpen, setConfirmOpen] = useState(false);

    async function handleDelete(): Promise<void> {
        const results = await Promise.allSettled(
            selection.map((row: { id: string }) =>
                api.mutate(deleteLegalNameAbbreviationDocument, { id: row.id }),
            ),
        );
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) toast.error(`${failed} abbreviation(s) could not be deleted`);
        else toast.success('Abbreviations deleted');
        table.resetRowSelection();
        refetchPaginatedList();
    }

    return (
        <>
            <DataTableBulkActionItem
                requiresPermission={['UpdateSettings']}
                onClick={() => setConfirmOpen(true)}
                label="Delete"
                icon={TrashIcon}
                className="text-destructive"
                closeOnClick={false}
            />
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete abbreviations</AlertDialogTitle>
                        <AlertDialogDescription>
                            Delete {selection.length} selected abbreviation(s)? Payment QR names
                            will print the full phrase again.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void handleDelete()}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
