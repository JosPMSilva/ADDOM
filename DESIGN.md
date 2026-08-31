---
version: alpha
name: ADDOM Cockpit
description: Local-first desktop coding cockpit for chat, approvals, execution evidence, project work, and inline operator decisions.
colors:
  ink: "#0B0C0C"
  shell: "#101211"
  shell-elevated: "#151715"
  panel: "#1A1C1A"
  panel-hover: "#20231F"
  panel-strong: "#272A25"
  border: "#2E312D"
  border-strong: "#44483F"
  text: "#F1F0E8"
  text-muted: "#A7AAA0"
  text-subtle: "#73786E"
  accent: "#B8B3A4"
  accent-strong: "#D5D0C1"
  success: "#A5C9A3"
  warning: "#D6B56D"
  danger: "#E08A7D"
  insert: "#A5C9A3"
  delete: "#E08A7D"
typography:
  title-md:
    fontFamily: Geist Sans
    fontSize: 1rem
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: 0em
  title-sm:
    fontFamily: Geist Sans
    fontSize: 0.875rem
    fontWeight: 620
    lineHeight: 1.35
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 450
    lineHeight: 1.55
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 450
    lineHeight: 1.45
    letterSpacing: 0em
  label-sm:
    fontFamily: Geist Sans
    fontSize: 0.75rem
    fontWeight: 560
    lineHeight: 1.35
    letterSpacing: 0em
  code-sm:
    fontFamily: Geist Mono
    fontSize: 0.8125rem
    fontWeight: 450
    lineHeight: 1.55
    letterSpacing: 0em
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 18px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
components:
  action-button:
    backgroundColor: "{colors.accent-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  secondary-button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  composer-shell:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  prompt-surface:
    backgroundColor: "{colors.shell-elevated}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  evidence-surface:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.text}"
    typography: "{typography.code-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  status-row:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.text-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
---

## Purpose

ADDOM is a local-first developer cockpit. It is not a landing page, a marketing app, or a generic chat toy.

The redesign target is a calm, precise graphite workspace for real coding work: chat, projects, threads, approvals, terminal activity, diffs, editor panels, artifacts, memory, settings, and agent decisions. It should feel mature, compact, and durable. The interface should make ongoing work, risk, evidence, and actions easy to scan without decorative UI competing for attention.

This document is the production visual contract. If this file conflicts with older component styling, production tokens, or docs, this file wins.

## Reference Hierarchy

Use references in this order:

1. **Approval sandbox is the primary inspiration source.**
   The production redesign language is neutral graphite, flatter prompt/decision surfaces, restrained borders, compact evidence, and reduced chrome.

2. **The supplied redesigned chat screenshot is the exact chat target.**
   The final chat/workspace surface should keep that composition as-is: title bar, left navigation, project/thread rail, header, evidence timeline, and anchored composer. If a real ADDOM function is missing from the mockup, preserve the original behavior, record the design question, and use the best reasonable sandbox interpretation unless the choice risks breaking a feature.

3. **The current Codex desktop app is a secondary polish reference only.**
   Use it for quality bar: precise spacing, restrained chrome, crisp dark surfaces, dense but readable rails, and focused developer-tool composition. Do not copy Codex branding, surfaces, component structure, or interaction model.

Do not invent missing design direction as if it were settled. When a production surface, state, or function is not covered by the approval sandbox, the chat screenshot, or an approved surface spec, record it as a follow-up redesign question and proceed with a conservative sandbox-aligned interpretation. Stop only when the missing decision risks breaking original functionality or making verification meaningless. The user remains the arbitrator for follow-up direction.

## Locked Product Decisions

- Normal launch goes straight to the chat/workspace surface.
- There is no standalone Welcome route, landing page, or intermediate home screen in normal startup.
- If no project or thread is available, project/thread entry appears inside the redesigned chat/workspace surface.
- New project and new thread flows live inside the main workspace composition.
- Project entry is a compact operator state, not a landing page. Keep shell chrome visible and avoid hero copy, feature cards, setup checklists, or onboarding-style guidance.
- Project/thread entry uses a dense side rail: project groups, thread previews, compact metadata, hover/focus actions, and no duplicate empty-state controls.
- Settings remains available before a project is open so provider/account setup stays reachable without a separate onboarding path.
- Onboarding is removed. Do not add a guided setup menu, wizard, checklist, or startup auto-open flow back into the app.
- The redesign is not a compatibility layer. Remove old blue/slate UI state instead of supporting it in parallel.
- Every original ADDOM function must continue to work. Visual cleanup is not allowed to remove behavior.
- Less is more: fewer cards, fewer badges, fewer borders, fewer gradients, fewer explanatory labels.

## Visual Thesis

ADDOM should look like a serious operator surface made of matte graphite, quiet dividers, restrained light text, and compact control rails. The interface should feel almost silent until a decision, risk, diff, or active execution state needs attention.

The primary impression should be:

- precise, not glossy
- dense, not cramped
- minimal, not empty
- technical, not decorative
- calm, not muted to the point of ambiguity

The product should be recognizable by composition and confidence, not by bright color.

## Color System

The palette is narrow and neutral.

- **Ink** is the deepest base. Use it for the app background, evidence wells, terminal bases, and diff wells.
- **Shell** is the main app frame. Use it for title bars, side rails, and panel backdrops.
- **Shell Elevated** is the first raised layer. Use it for active rails, list selections, and prompt surfaces.
- **Panel** is the primary contained surface. Use it for composer, modals, settings rows, and menus.
- **Panel Hover** is only for hover and soft selected states.
- **Panel Strong** is for active surfaces that need more contrast without becoming a card stack.
- **Border** is the default separator. It should be quiet.
- **Border Strong** is for focus, active shells, and modal boundaries.
- **Text** is primary content.
- **Text Muted** is secondary metadata.
- **Text Subtle** is tertiary metadata and disabled labels.
- **Accent** and **Accent Strong** are neutral graphite/warm-gray action tones, not brand-blue. Use them sparingly for primary affordances and focus priority.
- **Success, Warning, Danger, Insert, Delete** are semantic only. They should mark state, not theme a whole surface.
- Prompt and decision surfaces stay graphite even when semantic. A warning prompt may use a subdued warning label, dot, or border, but not a yellow/brown filled card.

No default blue, cyan, indigo, or slate action language. Blue-like colors may appear only as external content, Monaco/xterm syntax, provider logos, or a user-approved semantic exception.

Do not use gradients, glow, bokeh, decorative orbs, or neon accents for production surfaces.

## Typography

Typography should do most of the hierarchy work.

- Use **Geist Sans** for headers, controls, labels, section titles, and compact navigation.
- Use **Inter** for readable UI body copy where the app already relies on it.
- Use **Geist Mono** for paths, commands, model ids, diffs, terminal output, logs, and code evidence.
- Keep letter spacing at `0em`.
- Do not scale font size with viewport width.
- Keep headings compact inside the app shell. No hero-scale type in working surfaces.
- Prefer short labels and direct nouns: `Projects`, `Changes`, `Artifacts`, `Memory`, `Settings`.
- Avoid visible instructional filler. UI text should name the object or action, not explain the design.

## Layout And Composition

The supplied chat screenshot defines the primary composition:

- outer desktop window frame with restrained border
- narrow left app navigation rail
- project/thread rail inside the workspace
- main chat/workspace area
- compact header with title, mode, workspace, git/activity controls
- evidence timeline with sparse, readable rows
- anchored composer at the bottom

Keep that composition recognizable. Do not replace it with a landing page, dashboard, hero, split marketing layout, or decorative card grid.

General layout rules:

- One working surface per region.
- Page sections are unframed layouts or full-height work areas, not cards inside cards.
- Use separators and spacing before adding containers.
- Use borders for structure, not decoration.
- Keep dense lists scan-friendly with stable row height, clear active state, and compact metadata.
- Fixed, sticky, and floating elements must not overlap important content.
- Text must fit inside buttons, rails, cards, modals, and menus at desktop and narrow widths.

## Chrome And Elevation

The design should be low-chrome.

Allowed:

- quiet 1px borders
- tonal layering
- subtle inset evidence wells
- focused modal boundaries
- compact active row backgrounds

Avoid:

- nested card stacks
- heavy shadows
- glassy or glossy panels
- decorative gradients
- hover lift effects
- oversized badges
- pill clusters as default layout
- large empty chrome around simple controls

If a surface already has enough structure, remove framing instead of adding more.

Default to **tonal elevation separation** for product surfaces: distinguish adjacent layers with small graphite tone shifts and restrained shadow before adding an outline. Routine dialogs, cards, and popovers should not need decorative outer borders, segmented header/body/footer bands, or vertical lead-in rules when spacing and tone already communicate hierarchy. Keep borders and dividers only when they clarify real grouping, focus, or interaction. Removing chrome must not be offset with oversized padding; compact vertical rhythm is part of the preference.

## Shape And Radius

Use radius sparingly:

- `4px` to `6px` for evidence wells, inline chips, and tight controls.
- `8px` for buttons, menus, compact rows, and list selections.
- `12px` for inline prompt surfaces and `16px` for standalone decision dialogs.
- `18px` only for the composer shell or major modal frame.

Avoid playful rounding. The app should feel refined and serious.

## Buttons And Controls

Buttons are functional controls, not visual decoration.

- Prefer icon buttons for common actions when the icon is familiar.
- Use text buttons only for clear commands that need a label.
- Primary action uses neutral accent, not blue.
- Secondary actions stay graphite with muted text.
- Destructive actions use restrained semantic danger text on the final action. Add a border only when the control otherwise lacks affordance; do not use a full red panel for routine confirmation.
- Disabled states should be visibly disabled but still legible.
- Focus states must be clear, compact, and not blue by default.
- Mouse-initiated focus must not render an outer focus ring. Reserve restrained `:focus-visible` treatment for keyboard navigation, using a single quiet border or 1px ring rather than a heavy outline.
- Button labels must not overflow; shorten copy before resizing the whole control.

Dropdowns, menus, and popovers:

- Must fit within viewport bounds.
- Must not clip behind the composer, terminal dock, title bar, or side rails.
- Must have clear selected, hover, disabled, and dangerous states.
- Must close predictably on selection, escape, outside click, and relevant route changes.
- Must avoid card-like chrome. A menu is a compact command surface.
- Secondary option detail should not inflate default row height. Keep rows single-line where possible and reveal descriptions/details through hover, focus, title, or a dedicated detail affordance only when the user asks for it.
- Command palette rows should show the command name by default. Category, recent, and disabled-state context should stay available through hover/focus/title metadata instead of becoming always-visible badges or second lines.
- Provider/model menus use the same compact command-surface grammar. Provider rows, model groups, and provider-runtime details stay neutral; the selected model's group should open by default, and runtime/provider detail should remain hover/focus/title metadata rather than a visible badge in every row.

## App Shell

The app shell includes title bar, left navigation, project/thread rail, main workspace header, and panel routing.

Requirements:

- Launch directly into the chat/workspace surface.
- Keep the left navigation narrow and stable.
- Active rail states use restrained tonal contrast, not blue rails or glows.
- Project and thread entry lives in the shell, not a separate Welcome page.
- The project/thread rail follows the screenshot direction: project groups, active thread row, compact metadata, and quiet empty states.
- Empty project rails should show one clear project-opening action in the header. Do not duplicate `Open folder` in the empty state, and do not show search until there are projects to search.
- Thread create, rename, and delete dialogs use the same compact decision-dialog grammar as other workspace decisions: concise title, one object/input or safety sentence, neutral action row, and no visible setup guidance. A decision with an explicit Cancel action does not also show a close icon.
- Header controls stay compact. Git, terminal, provider, permission, and sync states should read as operator metadata, not badges competing with the title.

If a shell state is missing from the screenshot, preserve the existing shell behavior, record the open design question, and keep the implementation easy to adjust later.

## Chat Surface

The chat surface is the flagship surface and should remain visually closest to the supplied screenshot.

Requirements:

- Keep the screenshot composition as-is unless the user approves a change.
- Assistant content is mostly unboxed and content-led.
- User prompts can use a compact rounded surface but should not introduce blue.
- Evidence blocks sit inside calm, precise wells.
- The composer is anchored, rounded, and integrated with the timeline.
- The composer controls are compact and predictable.
- The plus action, send action, mode selector, permission selector, provider/model selector, context meter, overflow, and any terminal toggle must all fit the same control grammar.
- Provider/model continuity prompts use a compact status/action row near the header, not a floating card. Keep `Inject context`, `Memory`, `Artifacts`, and dismiss available; desktop rows may stay single-line, while narrow rows should wrap actions without obscuring the provider/model route.
- Empty chat states should feel like operational starting points, not marketing copy.

Missing real ADDOM functions must keep working. Record the design question and proceed conservatively unless placement would break the workflow.

## Prompt And Decision Surfaces

Prompt surfaces include question-user, role confirmation, dispatch confirmation, plan interaction, write conflict, terminal memory suggestion, provider terms, and similar inline decisions.

Rules:

- Treat them as structured messages, not decorative cards.
- Primary question or decision comes first.
- Actions are compact and aligned.
- Secondary evidence is visually subordinate but readable.
- Risk or danger uses semantic color only where needed.
- Standalone decisions use one uninterrupted tonal surface without decorative outlines, segmented bands, vertical lead-in rules, or redundant metadata rows.
- Keep consequence copy concise and let spacing establish hierarchy; do not compensate for removed chrome with excessive bottom padding.
- Do not use blue focus rings, blue buttons, or blue link styling as default.
- Do not create a different prompt style for each feature.

If a prompt type is missing from the sandbox references, use the shared prompt family conservatively and record the unanswered design question.

## Approval Surfaces

Approvals are trust-critical.

Rules:

- Summary first.
- Risk and scope second.
- Evidence next.
- Actions last.
- Raw command/details are available but visually de-emphasized until needed.
- Policy panels must not become nested alert cards.
- Default approval cards show the action intent, one primary target, concise scope, and only necessary warnings. Diagnostic policy data, provenance, and raw request payloads belong behind a collapsed details control.
- Avoid repeated titles, broad policy tables, shortcut instructions, and explanatory badges in the default approval view. Keep advanced details accessible without making the card feel like a debug panel.
- Browser, terminal, file, env, account-native, WSL, private network, large diff, and hosted-tool approvals all follow the same decision family unless the user approves a new variant.

Approval UI must be visually calm even when the decision is high risk.

## Evidence Surfaces

Evidence surfaces include diffs, file changes, runbooks, tool activity, hosted tool evidence, live execution, compaction events, reasoning archives, terminal output, code blocks, and markdown records.

Rules:

- Evidence should be precise and scannable.
- Monospace content should be readable at small sizes.
- File rows need stable columns and restrained metadata.
- Insert/delete colors are semantic and local to diff meaning.
- Copy/open/menu actions should be discoverable without dominating.
- Wide content must scroll or wrap intentionally, never break layout.
- Runtime diagnostics are compact status/evidence rows, not broad alert cards.
- Terminal transcript blocks embedded in chat history render as plain terminal output, not auto-highlighted source code.

Do not make evidence feel like a dashboard of badges.

## Composer

The composer is the control deck.

Requirements:

- Anchored at the bottom of the chat surface.
- Rounded major shell with low chrome.
- Text area is spacious but not oversized.
- Control row is compact and stable.
- Add-content, mode, permission, provider, model, context meter, overflow, and send controls should align to the same visual rhythm.
- Code/text blocks, attachments, Project Knowledge actions, and advanced editor access must not shift the shell unpredictably.
- Project Knowledge attachment actions should be compact state/action pairs. Use short visible labels such as `Local`, `Uploaded`, `Added`, `Add`, and `Attach`; keep provider-specific explanation in titles, aria labels, or settings copy instead of expanding the composer card.
- Dropdowns must open within the viewport and not cover critical state awkwardly.
- Loading, disabled, streaming, no provider, no thread, and no project states must be explicit.

If a composer function exists in ADDOM but is absent from the screenshot, preserve the function, use the existing control rhythm, and record the design question.

## Terminal

The terminal belongs to the cockpit, not a separate old app theme.

Rules:

- Terminal dock integrates with the composer/timeline rhythm.
- Terminal viewport can keep monospaced/xterm requirements, but the surrounding shell follows graphite tokens.
- Terminal toolbar actions are icon-first where familiar.
- Terminal search, context menu, session browser, global indicator, pending approval, and runtime readiness use the shared menu/status patterns.
- No blue-black hard-coded terminal frame unless it is an xterm theme necessity.
- ANSI blue/cyan/magenta are subdued into the graphite/warm-neutral palette for the chat terminal; semantic red, green, and yellow remain recognizable without theming the whole surface.
- Terminal output promoted into chat history must use the same graphite transcript treatment as terminal evidence, without navy code-block chrome or auto-detected blue syntax colors.
- Terminal runtime failures should be direct and compact.

## Panels

Panels include editor, changes/source control, artifacts, memory, Agents companion, settings, background jobs, and secondary overlays.

Rules:

- Use one panel layout family: header, optional toolbar, list/detail region, status rows, and compact empty/loading/error states.
- Do not turn panels into dashboard card grids.
- Lists should use dense rows, clear active state, and compact action menus.
- Detail panes should prioritize the object: file, diff, memory, role, provider, or setting.
- Secondary overlays use the shared dialog/menu contracts.
- Attachment preview/open-confirm dialogs stay compact and object-led: image preview prioritizes the media, file-open confirmation uses one safety sentence plus cancel/confirm actions, and cached/open failures must be friendly messages rather than raw error codes.

If a panel has no approved redesigned reference, use the shared panel family conservatively and record the design question before creating any new pattern.

## Settings

Settings should be the quietest high-density surface.

Target:

- compact preferences layout
- focused rail: General, Appearance, Terminal, Agents, Providers, Safety, Data
- flatter rows
- fewer nested cards
- smaller controls
- concise labels
- clear saved/pending/error states

Use a narrow category rail and a centered detail column. Group headings sit above quiet borderless tonal surfaces containing divider-separated label/control rows. Categories render continuously without accordions or persisted section-open state. Keep only genuinely secondary controls behind compact disclosures.

Apply **one concept, one owner** to settings hierarchy. The category title and description own the category scope; do not repeat the same title or paraphrase immediately as the first group heading and description. Add a group heading only when it narrows scope or separates a distinct cluster of controls. The Terminal category, for example, uses one `Terminal` heading and one consolidated description before its preference rows.

Provider settings must cover API keys, account auth, OpenRouter catalog visibility, provider logos, OpenAI Project Knowledge, account limitations, and advanced notices without turning into a dashboard.

Agents settings must cover custom instructions, agent delegation, the skill catalog, role forms, validation, and delete confirmation as compact preference/list/form surfaces. Dormant controls remain hidden until they are intentionally wired into production.

## Onboarding

Onboarding has been removed from the production app.

Do not preserve or recreate:

- guided setup menu entries
- onboarding wizard routes, modals, or steps
- onboarding progress stores/checklists
- startup auto-open behavior
- first-prompt or approval progress tracking that only served onboarding

The underlying setup capabilities remain part of the real app surfaces: project selection belongs in project/thread entry, provider and account setup belongs in Settings > Providers, permission/access controls belong in the chat header and Settings > Safety, and first-prompt guidance belongs in concise empty states when needed. The removal is a chrome and workflow simplification for advanced users, not a removal of provider, project, permission, chat, IPC, or settings functionality.

## Startup And First Paint

Startup must already feel like the redesigned app.

Rules:

- Startup splash, empty root, preload/loading, boot failure, and startup-ready handoff use the same graphite palette.
- No blue logo glow or old slate splash.
- Loading states are quiet and compact.
- Fatal boot errors use status/dialog language, not full-page marketing or noisy diagnostics.

## Icons And Logos

Iconography is thin, consistent, and functional.

- Use one icon family/weight per surface unless a state requires a clear exception.
- Icons inside buttons should align optically and not resize the control.
- Missing glyphs are a bug, not a styling opportunity.
- Logo usage is restrained. The brand should be clear in the shell but not visually louder than the work.
- App icon, tray icon, splash logo, title logo, and settings/about logo should share the same neutral treatment.

## Motion

Motion is optional and subordinate.

Allowed:

- quick opacity or translate transitions for menus/modals
- focus/hover transitions under 160ms
- subtle streaming or active-state indicators

Avoid:

- decorative motion
- large animated backgrounds
- springy/playful interactions
- motion that changes layout stability

Respect reduced-motion settings where present.

## Accessibility

The minimal surface still needs strong accessibility.

- Focus is always visible.
- Dialogs trap focus and close predictably.
- Menus and dropdowns are keyboard navigable.
- Icon-only controls have accessible names and tooltips where needed.
- Text contrast must remain high enough on all graphite surfaces.
- Disabled controls expose disabled state clearly.
- Scrollable regions must be reachable and understandable.

## QA And Completion Gate

A redesigned surface is not complete until it is inspected.

Required before closing a visual task, phase, or meaningful portion:

- Build a QA inventory from requirements, intended claims, changed controls, state changes, and at least two off-happy-path scenarios.
- Use Browser, Browser Mutation, Playwright, or Playwright Interactive as appropriate for screenshots and interaction checks.
- If expected tools are not available or exposed, record the gap and use the strongest available equivalent; do not claim production readiness unless real Browser/Playwright visual and interaction QA covered the changed surface.
- Capture screenshots of the surface and important opened states.
- Test changed buttons, menus, dropdowns, inputs, toggles, modals, keyboard/focus states, loading/disabled/error states, and navigation.
- Check dropdown overflow, clipping, text fit, excessive chrome, stale colors, nested cards, decorative gradients, and unnecessary badges.
- Run a visible-redundancy audit over headings, descriptions, logos, icons, status text, metadata, and actions. Remove adjacent elements that restate the same concept or produce the same outcome; preserve content that adds scope, consequence, state, or accessibility meaning.
- Confirm every original ADDOM function affected by the redesign still works.
- Record unresolved cleanup in the execution tracker with a disposition.

Docs-only design work does not require Browser QA unless it changes visual preview artifacts.

## Hard Stops

Stop and ask the user before proceeding when:

- a missing design decision risks breaking an original ADDOM feature or workflow
- a mockup omits a production function and no conservative placement can preserve it
- a proposed change would alter the supplied chat composition
- a missing Browser/Playwright capability makes the intended visual or preservation claim unverifiable
- a visual cleanup risks removing or weakening existing behavior
- a phase would require keeping old UI compatibility

## Do

- Keep the approval sandbox as the primary inspiration source.
- Keep the supplied chat surface as-is unless the user approves a change.
- Use Codex desktop app only as a secondary polish bar.
- Prefer fewer surfaces, tighter rows, and clearer hierarchy.
- Use tokens and shared contracts instead of local one-off colors.
- Preserve behavior first, then clean visual form.
- Record unresolved visual or functional risks in the tracker.

## Don't

- Do not use blue as the default action accent.
- Do not copy Codex surfaces or interaction models.
- Do not invent missing design direction.
- Do not create a Welcome replacement that behaves like another landing page.
- Do not add broad compatibility shims for old UI.
- Do not stack cards inside cards.
- Do not use gradients, glow, decorative orbs, bokeh, or glossy effects.
- Do not turn every state into a pill badge.
- Do not let modal or panel chrome overpower the decision, object, or evidence.
- Do not mark visual work complete without screenshots and interaction checks.
