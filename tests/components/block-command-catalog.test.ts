import { describe, expect, it } from "vitest";
import { KEYS } from "platejs";

import {
  BLOCK_COMMAND_GROUPS,
  BLOCK_COMMANDS,
  getBlockCommandGroups,
  getBlockCommands,
} from "@/components/editor/block-command-catalog";

describe("shared block command catalog", () => {
  it("keeps command ids unique and every command in a declared group", () => {
    expect(new Set(BLOCK_COMMANDS.map((command) => command.id)).size).toBe(
      BLOCK_COMMANDS.length,
    );

    const groupIds = new Set(BLOCK_COMMAND_GROUPS.map((group) => group.id));
    for (const command of BLOCK_COMMANDS) {
      expect(groupIds.has(command.group)).toBe(true);
      expect(command.label).not.toBe("");
      expect(command.description).not.toBe("");
      expect(command.keywords.length).toBeGreaterThan(0);
      expect(command.icon).toBeTypeOf("object");
    }
  });

  it("covers every rich block family required by the editor", () => {
    const insertValues = new Set(
      getBlockCommands("insert").map((command) => command.value),
    );

    for (const type of [
      KEYS.p,
      KEYS.h1,
      KEYS.h2,
      KEYS.h3,
      KEYS.blockquote,
      KEYS.ul,
      KEYS.ol,
      KEYS.listTodo,
      KEYS.table,
      KEYS.img,
      KEYS.codeBlock,
      KEYS.equation,
      KEYS.callout,
      KEYS.toc,
      KEYS.hr,
    ]) {
      expect(insertValues.has(type), `missing insert command for ${type}`).toBe(
        true,
      );
    }
  });

  it("derives insertion and turn-into surfaces from the same commands", () => {
    const inserts = getBlockCommands("insert");
    const turnInto = getBlockCommands("turnInto");
    const insertIds = new Set(inserts.map((command) => command.id));

    expect(turnInto.length).toBeGreaterThan(0);
    for (const command of turnInto) {
      expect(insertIds.has(command.id)).toBe(true);
    }

    expect(
      getBlockCommandGroups("turnInto").flatMap((group) => group.commands),
    ).toEqual(turnInto);
  });

  it("only offers text-like blocks as turn-into targets", () => {
    const turnIntoValues = new Set(
      getBlockCommands("turnInto").map((command) => command.value),
    );

    expect(turnIntoValues).toEqual(
      new Set([
        KEYS.p,
        KEYS.h1,
        KEYS.h2,
        KEYS.h3,
        KEYS.h4,
        KEYS.blockquote,
        KEYS.ul,
        KEYS.ol,
        KEYS.listTodo,
        KEYS.codeBlock,
      ]),
    );
  });
});
