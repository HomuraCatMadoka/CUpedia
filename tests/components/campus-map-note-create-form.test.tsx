/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { command, push } = vi.hoisted(() => ({
  command: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/campus-map/map-note-actions", () => ({
  commandCampusMapNoteAction: (...args: unknown[]) => command(...args),
}));

import { CampusMapNoteCreateForm } from "@/components/campus-map/map-note-create-form";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("CampusMapNoteCreateForm", () => {
  it("creates a typed Place/WGS84 note and opens its stable URL", async () => {
    command.mockResolvedValue({
      status: "created",
      noteId: "8952c528-4ec6-4694-9ff0-0d10b28f78f1",
      eventId: "d098f5c7-8672-4a44-a0bd-2b17cc4dcb60",
      revision: 1,
    });
    render(
      <CampusMapNoteCreateForm initialPlaceId="5a63f8ca-f238-4f62-8a8c-165b1048ec0a" />,
    );

    fireEvent.change(screen.getByLabelText("经度（WGS84，可选）"), {
      target: { value: "114.207" },
    });
    fireEvent.change(screen.getByLabelText("纬度（WGS84，可选）"), {
      target: { value: "22.419" },
    });
    fireEvent.change(screen.getByLabelText("备注内容"), {
      target: { value: "入口标记需要核对" },
    });
    fireEvent.submit(screen.getByLabelText("备注内容").closest("form")!);

    await waitFor(() => expect(command).toHaveBeenCalledOnce());
    expect(command.mock.calls[0][0]).toMatchObject({
      kind: "create",
      placeId: "5a63f8ca-f238-4f62-8a8c-165b1048ec0a",
      position: { longitude: 114.207, latitude: 22.419, crs: "wgs84" },
      openingComment: "入口标记需要核对",
    });
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/campus-map/notes/8952c528-4ec6-4694-9ff0-0d10b28f78f1",
      ),
    );
  });
});
