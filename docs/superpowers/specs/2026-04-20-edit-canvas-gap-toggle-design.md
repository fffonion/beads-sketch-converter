# Edit Canvas Gap Toggle Design

## Summary

Add a new display-only toggle for the pixel-art edit canvas that controls whether a visible gap is rendered between cells.

The toggle applies only to the `edit` canvas view. It does not affect:

- the `pindou` view
- chart export rendering
- share links
- existing chart export gapless settings

The default behavior after this change is gapless edit rendering: the toggle defaults to hiding the inter-cell gap.

## Goals

- Let users switch the edit canvas between gapless cells and the current gapped cell display.
- Default to gapless edit rendering.
- Keep the toggle reachable and visually stable on desktop, mobile portrait, and mobile landscape layouts.
- Preserve all existing non-edit rendering behavior.

## Non-Goals

- Persisting the new toggle across reloads.
- Changing `pindou` canvas rendering.
- Changing chart export or preview gap handling.
- Introducing a new settings panel or secondary menu just for this control.

## Current State

The edit canvas is rendered by `CanvasStage` in `stageMode="edit"`. The inter-cell spacing is currently hard-coded through a shared `gridGap = 1` value inside the stage renderer. This means the edit canvas always shows a visible gap and cannot be toggled independently.

There is already a separate `chartGaplessCells` setting for chart export, but that setting belongs to export output and must remain independent from the edit-canvas display behavior.

## Proposed Design

### State Model

Add a new top-level boolean UI state for the edit canvas gap display, named to reflect rendered behavior rather than export behavior.

Expected semantics:

- `true`: show a visible gap between edit cells
- `false`: hide the gap and render cells flush

Default value:

- `false`

This state will be threaded through the existing component chain:

- `App`
- `WorkspacePanels`
- `PixelEditorPanel`
- `CanvasStage`

### Rendering Behavior

`CanvasStage` will stop using a single hard-coded gap for every mode.

Instead:

- `stageMode="edit"` uses the new toggle-controlled gap
- `stageMode="pindou"` keeps its current rendering behavior unchanged

The edit canvas gap values are:

- gap shown: `1`
- gap hidden: `0`

All stage sizing calculations that currently depend on `gridGap` must use the mode-specific value so the rendered geometry, zoom behavior, hover math, brush cursor sizing, and crop overlays stay aligned with the displayed cells.

### Control Placement

The new toggle will live in the existing edit toolbar area rather than in the export settings or a nested menu.

Rationale:

- It is a display control for the live edit canvas.
- Users need to discover and toggle it quickly while editing.
- The existing toolbar already adapts across desktop and mobile layouts, so reusing it minimizes layout divergence.

The label should clearly describe the visible behavior. A direct label such as "Show Cell Gaps" or equivalent localized text is preferred over overloaded export-oriented wording like "Gapless".

### Responsive Expectations

The control must remain accessible and visually correct in:

- desktop edit layout
- mobile portrait edit layout
- mobile landscape edit layout

Acceptance criteria for all three:

- the toggle remains visible in the edit controls surface
- it is clickable/tappable
- it does not overlap adjacent controls
- it does not cause toolbar wrapping that breaks the stage region
- toggling it immediately changes the edit canvas cell spacing

## Testing Strategy

Follow TDD:

1. Add a failing regression test for edit-stage gap calculation with the toggle both on and off.
2. Add layout-level tests that confirm the toggle is present in desktop, mobile portrait, and mobile landscape edit control render paths.
3. Implement the minimum code needed to pass.
4. Run the targeted tests and the full test suite.

Testing should cover:

- edit mode with gap visible
- edit mode with gap hidden
- `pindou` mode unchanged
- toolbar/control presence in responsive edit layouts

## Risks and Mitigations

### Risk: Stage math drifts from rendered pixels

If the gap value changes in drawing code but not in interaction math, hover, painting, crop selection, and zoom sizing can become misaligned.

Mitigation:

- drive all edit-stage spacing calculations from the same mode-specific gap value
- add tests around stage metrics rather than only visual wiring

### Risk: Toolbar crowding on mobile landscape

The edit toolbar already compresses heavily in narrow layouts. A new control can cause wrapping or clipped interactions.

Mitigation:

- place the toggle alongside existing edit display controls rather than adding a separate block
- verify mobile landscape render paths explicitly in tests

## Implementation Notes

- Keep the new state display-only and local to current app session.
- Do not reuse `chartGaplessCells`; that would couple edit display to export output and create incorrect cross-feature behavior.
- Prefer a single, explicit prop name that communicates edit-canvas gap visibility.

## Acceptance Criteria

- The edit canvas exposes a new gap toggle in the edit controls.
- The default edit canvas is gapless.
- Turning the toggle on restores visible cell gaps.
- Turning the toggle off removes visible cell gaps.
- `pindou` rendering is unchanged.
- Chart export settings and output are unchanged.
- The toggle is usable on desktop, mobile portrait, and mobile landscape layouts.
