# Manager portal responsive shell contract

One breakpoint, one rule per component. Check this table before touching any of these
components, instead of re-deriving visibility rules from scratch.

## Breakpoint

**800px** (`@media (max-width: 800px)`) is the only breakpoint used by the manager portal's
app-shell components. Every component below uses this exact value — never a different number.
If a new responsive-shell component is added, it must use `800px` too.

## Component visibility

| Component                            | Mobile (≤800px)                 | Desktop/tablet (>800px) | Why                                                        |
| ------------------------------------ | ------------------------------- | ----------------------- | ---------------------------------------------------------- |
| `MvAppSidebar`                       | hidden                          | visible                 | primary desktop nav                                        |
| `MvAppTopbar` (search/actions)       | collapsed                       | visible                 | full topbar only fits wider screens                        |
| `MvAppMobileNav` (bottom tab bar)    | visible                         | hidden                  | replaces the sidebar on narrow screens                     |
| `MvAppMobileMoreSheet`               | visible (opened via bottom nav) | hidden                  | secondary nav overflow, mobile-only                        |
| `MvFab` (+ create button)            | visible                         | hidden                  | bottom-nav/FAB are a mobile-only affordance                |
| `MvScrollNav` (scroll-to-top/bottom) | visible                         | visible                 | long pages need this on any screen size                    |
| `MvKpiCarousel` arrows               | visible                         | visible                 | explicit user request: carousel arrows are not mobile-only |

**Rule of thumb:** anything that exists specifically because there's no room for the desktop
chrome (bottom nav, FAB, the More sheet) is mobile-only. Anything that's a general navigation
aid unrelated to screen real estate (scroll-to-top, carousel arrows) shows everywhere. Do not
collapse this distinction — a past regression hid the bottom-nav/FAB fix behind "just add
`@media` everywhere," which would have also hidden the KPI carousel arrows the user explicitly
wants on desktop.

## Known gap

No shared CSS/TS breakpoint constant exists yet — every component hand-writes
`@media (max-width: 800px)`. Introducing one (e.g. a `$mv-mobile-breakpoint` SCSS variable or a
`MOBILE_BREAKPOINT` TS constant used by `useIsMobileViewport`) would remove the risk of the value
drifting between components, but is a separate follow-up, not done as part of this fix.
