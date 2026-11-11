import { describe, expect, it } from 'vitest';
import { addRecent, removeRecent } from '../../utils/recentSearches';

describe('recent searches', () => {
    it('adds trimmed queries newest first', () => {
        expect(addRecent(['a'], '  b ')).toEqual(['b', 'a']);
    });

    it('moves a repeated query to the front instead of duplicating it', () => {
        expect(addRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
    });

    it('ignores an empty query', () => {
        expect(addRecent(['a'], '   ')).toEqual(['a']);
    });

    it('keeps at most the limit, dropping the oldest', () => {
        expect(addRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
    });

    it('removes one query and leaves the rest', () => {
        expect(removeRecent(['a', 'b'], 'a')).toEqual(['b']);
    });
});
