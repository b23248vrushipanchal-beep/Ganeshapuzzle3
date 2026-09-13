/*
Standalone shims for the Framer runtime API ("framer" package).

When this component is pasted back into Framer, replace the import in
PuzzleGame.tsx:

    import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

Outside of Framer these are no-ops:
- addPropertyControls does nothing (the property panel doesn't exist here).
- ControlType is a plain enum-like object of string constants.
- useIsStaticRenderer always reports an interactive (non-static) renderer.
*/

export function addPropertyControls(
    _component: unknown,
    _controls: unknown
): void {
    /* no-op outside of Framer */
}

export const ControlType = {
    ResponsiveImage: "ResponsiveImage",
    Enum: "Enum",
    Color: "Color",
    Number: "Number",
    Boolean: "Boolean",
    String: "String",
    Array: "Array",
    Object: "Object",
    FusedNumber: "FusedNumber",
    SegmentedEnum: "SegmentedEnum",
} as const

export type ControlTypeValue =
    (typeof ControlType)[keyof typeof ControlType]

export function useIsStaticRenderer(): boolean {
    return false
}
