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
    toast,
} from '@vendure/dashboard';

import { setDefaultBranchDocument } from './branches.graphql.js';
import {
    DEFAULT_BRANCH_CONSEQUENCES,
    DEFAULT_BRANCH_EXPLANATION,
    buildSetDefaultMessage,
} from './default-branch-consequences.js';

export interface SetDefaultBranchDialogProps {
    target: { id: string; name: string } | null;
    currentDefaultName: string | null;
    onClose: () => void;
    onSaved: () => void;
}

export function SetDefaultBranchDialog({
    target,
    currentDefaultName,
    onClose,
    onSaved,
}: SetDefaultBranchDialogProps) {
    const [saving, setSaving] = useState(false);

    async function handleConfirm(): Promise<void> {
        if (!target) return;
        setSaving(true);
        try {
            await api.mutate(setDefaultBranchDocument, { branchId: target.id });
            toast.success('Default branch changed');
            onSaved();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not set the default branch');
        } finally {
            setSaving(false);
        }
    }

    return (
        <AlertDialog open={target !== null} onOpenChange={open => !open && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Change the default branch</AlertDialogTitle>
                    <AlertDialogDescription>
                        {target && buildSetDefaultMessage(target.name, currentDefaultName)}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <p className="text-sm text-muted-foreground">{DEFAULT_BRANCH_EXPLANATION}</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {DEFAULT_BRANCH_CONSEQUENCES.map(line => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled={saving} onClick={() => void handleConfirm()}>
                        Make default
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
