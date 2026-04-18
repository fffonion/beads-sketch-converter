import { expect, test } from "bun:test";
import { formatProcessingElapsedNote } from "../src/components/pixel-editor-panel";

test("processing elapsed note should only show the formatted duration text", () => {
  expect(formatProcessingElapsedNote(0)).toBeNull();
  expect(formatProcessingElapsedNote(218)).toBe("218 ms");
  expect(formatProcessingElapsedNote(1520)).toBe("1.52 s");
});
