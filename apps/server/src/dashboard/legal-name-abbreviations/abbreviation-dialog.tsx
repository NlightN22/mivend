import { useEffect, useState } from 'react';
import {
    api,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    toast,
} from '@vendure/dashboard';

import {
    createLegalNameAbbreviationDocument,
    updateLegalNameAbbreviationDocument,
} from './legal-name-abbreviations.graphql.js';

export interface EditableAbbreviation {
    id: string;
    phrase: string;
    abbreviation: string;
}

export interface AbbreviationDialogProps {
    open: boolean;
    // null creates a new abbreviation.
    editing: EditableAbbreviation | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

export function AbbreviationDialog({
    open,
    editing,
    onOpenChange,
    onSaved,
}: AbbreviationDialogProps) {
    const [phrase, setPhrase] = useState('');
    const [abbreviation, setAbbreviation] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setPhrase(editing?.phrase ?? '');
        setAbbreviation(editing?.abbreviation ?? '');
        setError(null);
    }, [open, editing]);

    async function handleSave(): Promise<void> {
        setSaving(true);
        setError(null);
        try {
            const input = { phrase, abbreviation };
            if (editing) {
                await api.mutate(updateLegalNameAbbreviationDocument, { id: editing.id, input });
            } else {
                await api.mutate(createLegalNameAbbreviationDocument, { input });
            }
            toast.success('Abbreviation saved');
            onSaved();
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the abbreviation');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit abbreviation' : 'New abbreviation'}</DialogTitle>
                    <DialogDescription>
                        Shortens the phrase in the payment QR recipient name only; the printed
                        document keeps the full name.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                    <Label htmlFor="abbreviation-phrase">Full phrase</Label>
                    <Input
                        id="abbreviation-phrase"
                        value={phrase}
                        onChange={e => setPhrase(e.target.value)}
                    />
                    <Label htmlFor="abbreviation-short">Abbreviation</Label>
                    <Input
                        id="abbreviation-short"
                        value={abbreviation}
                        onChange={e => setAbbreviation(e.target.value)}
                    />
                </div>
                {error && <p className="text-destructive text-sm">{error}</p>}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={saving}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
