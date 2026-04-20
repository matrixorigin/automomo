# Programa Alignment Spec

## Source

Mobbin source: Programa Web previews from the public metadata for the provided
Mobbin URL. The logged-in screen collection was not accessible in the browser
session, but the page metadata exposed two web preview screens:

- Marketing hero: white page, dark announcement bar, giant centered headline,
  black wordmark, acid-yellow `Get started` button, floating workflow cards.
- Product workspace: slim left rail, white canvas, dense schedule table, tiny
  grey metadata, segmented tabs, black top actions, yellow upgrade/status
  accents, restrained dividers.

## Design Patterns For automomo

### Layout

- Replace the dark fixed app bar with a Programa-style dark announcement strip
  and a white toolbar below it.
- Use a narrow left rail with workspace identity, project/repo navigation,
  tool links, libraries, and a bottom upgrade panel.
- Treat the main view like a shared work schedule: breadcrumbs, compact tabs, a
  summary strip, section headers, then dense rows.
- Keep cards rare. Rows and thin separators should carry most information.

### Visual Hierarchy

- Move from dark purple MUI surfaces to a white canvas with soft grey rail and
  black text.
- Use black for primary commands, acid yellow for upgrade/status emphasis, and
  low-contrast grey for operational metadata.
- Prefer large, confident titles only at the top. Inside the workspace, keep
  typography compact and scannable.
- Keep border radius modest. Programa uses softened controls, but the product
  table itself is mostly rectilinear and quiet.

### Interactions

- Segmented tabs should feel like mode switches, not decorative pills.
- Search, filter, sort, and toggle controls belong in the same toolbar.
- Rows should expose quick actions inline: details, quote/analyze, status menu,
  overflow.
- Bottom-right creation action mirrors Programa's `New` button.

### Recommended Changes

1. Theme automomo to a light operational palette: white canvas, `#f4f4f1`
   rail, `#111111` text/action, `#eff51a` accent, `#e9e9e3` separators.
2. Reframe work items and sessions as schedule tables grouped by status,
   ownership, or runtime, with compact metadata columns.
3. Replace dark app shell cards with a narrow rail, top breadcrumb toolbar, and
   one dense primary workspace.
4. Use the bottom rail panel for local runtime/account state, replacing large
   status cards where possible.
5. Keep details, human handoff, and orchestration as drawers/side panels in the
   final app; this prototype shows them as right-side row metadata and inline
   action controls.

## Prototype Scope

The prototype in this repo is static and dependency-free. It is intended as a
visual and structural handoff for the automomo product direction.
