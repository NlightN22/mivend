import { useEffect, useState } from 'react';
import {
    api,
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    toast,
} from '@vendure/dashboard';

import { createBranchDocument, renameBranchDocument } from './branches.graphql.js';

export interface BranchNameDialogProps {
    open: boolean;
    // null creates a new branch.
    editing: { id: string; name: string } | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

export function BranchNameDialog({ open, editing, onOpenChange, onSaved }: BranchNameDialogProps) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setName(editing?.name ?? '');
        setError(null);
    }, [open, editing]);

    async function handleSave(): Promise<void> {
        const trimmed = name.trim();
        if (!trimmed) return;
        setSaving(true);
        setError(null);
        try {
            if (editing) {
                await api.mutate(renameBranchDocument, { branchId: editing.id, name: trimmed });
            } else {
                await api.mutate(createBranchDocument, { name: trimmed });
            }
            toast.success('Branch saved');
            onSaved();
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the branch');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editing ? 'Rename branch' : 'New branch'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2">
                    <Label htmlFor="branch-name">Branch name</Label>
                    <Input
                        id="branch-name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') void handleSave();
                        }}
                    />
                </div>
                {error && <p className="text-destructive text-sm">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={saving || !name.trim()}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
