// AGENTS.md's Comments section: "Hard cap: 1-2 lines per comment, full stop." Flags any
// contiguous comment (a run of adjacent `//` lines, or a single `/* */` block) longer than that —
// catches the "multi-paragraph real-incident narrative" pattern this rule was added to stop,
// which a human reviewer has to notice by eye otherwise.
const MAX_LINES = 2;

function groupLineComments(comments) {
    const groups = [];
    let current = null;
    for (const comment of comments) {
        if (comment.type !== 'Line') {
            if (current) groups.push(current);
            current = null;
            continue;
        }
        if (current && comment.loc.start.line === current.lastLine + 1) {
            current.comments.push(comment);
            current.lastLine = comment.loc.end.line;
        } else {
            if (current) groups.push(current);
            current = { comments: [comment], lastLine: comment.loc.end.line };
        }
    }
    if (current) groups.push(current);
    return groups;
}

export default {
    meta: {
        type: 'suggestion',
        docs: {
            description:
                'Disallow comments longer than 2 lines — AGENTS.md: put the long explanation in docs/ instead of inlining it.',
        },
        schema: [],
    },
    create(context) {
        return {
            Program() {
                const sourceCode = context.sourceCode ?? context.getSourceCode();
                const comments = sourceCode.getAllComments();

                for (const comment of comments) {
                    if (comment.type !== 'Block') continue;
                    const lineCount = comment.value.split('\n').length;
                    if (lineCount > MAX_LINES) {
                        context.report({
                            loc: comment.loc,
                            message: `Block comment is ${lineCount} lines — AGENTS.md caps comments at ${MAX_LINES} lines; move the explanation to docs/ and link it instead.`,
                        });
                    }
                }

                for (const group of groupLineComments(comments)) {
                    if (group.comments.length > MAX_LINES) {
                        context.report({
                            loc: {
                                start: group.comments[0].loc.start,
                                end: group.comments[group.comments.length - 1].loc.end,
                            },
                            message: `Comment block is ${group.comments.length} lines — AGENTS.md caps comments at ${MAX_LINES} lines; move the explanation to docs/ and link it instead.`,
                        });
                    }
                }
            },
        };
    },
};
