"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { commandCampusMapNoteAction } from "@/lib/campus-map/map-note-actions";

export function CampusMapNoteCreateForm({
  initialPlaceId = "",
}: {
  initialPlaceId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function submit(formData: FormData) {
    const longitudeText = String(formData.get("longitude") ?? "").trim();
    const latitudeText = String(formData.get("latitude") ?? "").trim();
    if ((longitudeText === "") !== (latitudeText === "")) {
      setMessage("经度和纬度需要一起填写");
      return;
    }
    const position =
      longitudeText === ""
        ? null
        : {
            longitude: Number(longitudeText),
            latitude: Number(latitudeText),
            crs: "wgs84" as const,
          };
    setMessage("");
    startTransition(async () => {
      const result = await commandCampusMapNoteAction({
        kind: "create",
        idempotencyKey: crypto.randomUUID(),
        placeId: String(formData.get("placeId") ?? "").trim() || null,
        position,
        openingComment: String(formData.get("openingComment") ?? ""),
      });
      if (result.status === "created") {
        router.push(`/campus-map/notes/${result.noteId}`);
        return;
      }
      if (result.status === "authentication-required") {
        setMessage("请先登录再建立地图备注");
      } else if (result.status === "rate-limited") {
        setMessage(`操作太频繁，请在 ${result.retryAfter} 秒后重试`);
      } else if (result.status === "forbidden") {
        setMessage("你的帐号暂时不能建立地图备注");
      } else {
        setMessage("无法建立备注，请检查地点、坐标和内容");
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
      className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm"
    >
      <label className="grid gap-1 text-sm font-semibold">
        Place ID（可选）
        <input
          name="placeId"
          defaultValue={initialPlaceId}
          className={fieldClass}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">
          经度（WGS84，可选）
          <input
            name="longitude"
            type="number"
            min={-180}
            max={180}
            step="any"
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          纬度（WGS84，可选）
          <input
            name="latitude"
            type="number"
            min={-90}
            max={90}
            step="any"
            className={fieldClass}
          />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        请至少填写 Place ID，或同时填写一组 WGS84 坐标。
      </p>
      <label className="grid gap-1 text-sm font-semibold">
        备注内容
        <textarea
          name="openingComment"
          required
          maxLength={2000}
          rows={6}
          className={fieldClass}
        />
      </label>
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "正在建立…" : "建立地图备注"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-sm font-medium"
      >
        {message}
      </p>
    </form>
  );
}

const fieldClass =
  "min-h-11 rounded-xl border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
