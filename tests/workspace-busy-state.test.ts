import { expect, test } from "bun:test";
import {
  getWorkspaceStageBusy,
  getWorkspaceUiBusy,
} from "../src/lib/workspace-busy-state";

test("workspace busy state should keep editor refresh busy out of the canvas loading overlay", () => {
  expect(getWorkspaceUiBusy(false, false)).toBe(false);
  expect(getWorkspaceUiBusy(true, false)).toBe(true);
  expect(getWorkspaceUiBusy(false, true)).toBe(true);

  expect(getWorkspaceStageBusy(false, false)).toBe(false);
  expect(getWorkspaceStageBusy(true, false)).toBe(true);
  expect(getWorkspaceStageBusy(false, true)).toBe(false);
});
