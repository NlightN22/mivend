import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Badge, useUserSettings } from '@vendure/dashboard';

import { parseIssueLink } from './issue-links.js';

export function CountLink({
    count,
    href,
    destructive = false,
    muted = false,
    title = 'Show these rows',
    icon,
    hideZero = false,
}: Readonly<{
    count: number;
    href: string;
    destructive?: boolean;
    muted?: boolean;
    title?: string;
    icon?: ReactNode;
    hideZero?: boolean;
}>) {
    const navigate = useNavigate();
    const { setTableSettings } = useUserSettings();
    if (count === 0) return hideZero ? null : <>0</>;

    function open(event: React.MouseEvent): void {
        const target = parseIssueLink(href);
        if (!target.pageId) return;
        event.preventDefault();
        setTableSettings(target.pageId, 'columnFilters', target.filters as never);
        void navigate({ to: target.path });
    }

    return (
        <a href={href} title={title} onClick={open}>
            <Badge variant={destructive ? 'destructive' : muted ? 'outline' : 'secondary'}>
                {icon}
                {count}
            </Badge>
        </a>
    );
}
