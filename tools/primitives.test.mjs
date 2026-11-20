// tools/primitives.mjs: what counts as a control drawn by hand in a block or screen.
import { expect, test } from "bun:test";
import { kindOf } from "./primitives.mjs";

test("an element that is a control is its kind", () => {
  expect(kindOf('      button press=go testId="go"')).toBe("button");
  expect(kindOf('      select value=v change=pick aria-label="Scope"')).toBe("field");
  expect(kindOf('      input type="checkbox" checked=on change=flip')).toBe("check");
  expect(kindOf('      column popover="auto" role="menu"')).toBe("menu");
});

// A prop declared with a control's name (`select: enum<"off", "on">`, `button: string`) is not a control drawn by hand.
test("a prop named like a control is not a control", () => {
  expect(kindOf('    select: enum<"off", "on", "hidden">')).toBeNull();
  expect(kindOf("    select: action")).toBeNull();
  expect(kindOf("    button: string")).toBeNull();
});
