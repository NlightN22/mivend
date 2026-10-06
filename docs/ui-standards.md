# UI standards: colors and button states

Single reference for interactive colors. Source of truth is `packages/ui-kit` (`styles/tokens.css`,
`MvButton`). Pages never invent their own hover/active colors.

## Button states

| Variant (`MvButton`) | Idle                            | Hover                                | Active                                 |
| -------------------- | ------------------------------- | ------------------------------------ | -------------------------------------- |
| `primary` (green)    | `#00b894`                       | `#00a884`                            | `#008a70`                              |
| `buy` (orange)       | `--app-accent-orange` `#ff8a00` | `--app-accent-orange-hover` `#e67c00` | `--app-accent-orange-active` `#cc6e00` |
| `catalog` (lime)     | `--app-accent-lime` `#c8f21a`   | `#b8e010`                            | `#a8cc0a`                              |
| `secondary`, `ghost`, `danger` | see `MvButton.vue`    | defined there                        | defined there                          |

## Rules

- Use `MvButton` with a variant whenever the element is a button. Custom-styled buttons or
  button-like links (e.g. a `RouterLink` styled as a button) must reuse the same tokens and define
  **idle, `:hover`, `:active`, and `:disabled`** states.
- Orange/lime/accent colors come from `--app-*` tokens with the standard value as fallback; no raw
  hex for interactive colors. A new interactive color means a new token in `tokens.css` first.
- Hover/active are never improvised per page (`#e87800`, `#e07a00` etc. are the bug this file exists
  to prevent).

## Audit command

Run before declaring UI work done; every hit on a button/link background must be explained or fixed:

```
grep -rnE "#ff8a00|#ff8900|#e67c00|#e87800|#e07a00|#cc6e00|#00b894|#00a884|#c8f21a" \
  packages/storefront/src packages/manager/src --include=*.vue | grep -v "var(--app"
```
