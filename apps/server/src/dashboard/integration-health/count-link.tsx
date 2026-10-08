import { useNavigate } from '@tanstack/react-router';
import { Badge, useUserSettings } from '@vendure/dashboard';

import { parseIssueLink } from './issue-links.js';

export function CountLink({
    count,
    href,
    destructive = false,
}: Readonly<{ count: number; href: string; destructive?: boolean }>) {
    const navigate = useNavigate();
    const { setTableSettings } = useUserSettings();
    if (count === 0) return <>0</>;

    function open(event: React.MouseEvent): void {
        const target = parseIssueLink(href);
        if (!target.pageId) return;
        event.preventDefault();
        setTableSettings(target.pageId, 'columnFilters', target.filters as never);
        void navigate({ to: target.path });
    }

    return (
        <a href={href} title="Show these rows" onClick={open}>
            <Badge variant={destructive ? 'destructive' : 'secondary'}>{count}</Badge>
        </a>
    );
}
