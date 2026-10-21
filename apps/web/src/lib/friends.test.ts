import { describe, expect, it } from "vitest";
import { MAX_FRIENDS } from "@radius/protocol";
import { removeSaved, upsertSaved } from "./friends";

const id = (n: number) => n.toString(16).padStart(64, "0");

describe("saved devices", () => {
  it("adds, refreshes the name without moving the entry, and removes", () => {
    let list = upsertSaved([], { id: id(1), name: "고래" }, 10);
    list = upsertSaved(list, { id: id(2), name: "파도" }, 20);
    list = upsertSaved(list, { id: id(1), name: "새이름" }, 30);
    expect(list).toEqual([
      { id: id(1), name: "새이름", savedAt: 10 },
      { id: id(2), name: "파도", savedAt: 20 },
    ]);
    expect(removeSaved(list, id(1)).map((d) => d.id)).toEqual([id(2)]);
    expect(removeSaved(list, id(9))).toHaveLength(2);
  });
  it("keeps at most MAX_FRIENDS, dropping the oldest", () => {
    let list = upsertSaved([], { id: id(0), name: "x" }, 0);
    for (let i = 1; i <= MAX_FRIENDS; i++) list = upsertSaved(list, { id: id(i), name: "x" }, i);
    expect(list).toHaveLength(MAX_FRIENDS);
    expect(list.some((d) => d.id === id(0))).toBe(false);
  });
});
