"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";

import type { CampusMapPinType } from "@/db/schema";
import { cn } from "@/lib/utils";
import { campusMapPlacePhotoRoleLabel } from "@/lib/campus-map/display-registry";
import type { CampusMapEditPhoto } from "@/lib/campus-map/edit-session";
import {
  campusMapPlacePhotoUrl,
  CAMPUS_MAP_PLACE_PHOTO_MAX_COUNT,
  CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES,
  CAMPUS_MAP_PLACE_PHOTO_ROLES,
  type CampusMapPlacePhotoAssetView,
  type CampusMapPlacePhotoRole,
  type CampusMapPlacePhotoUploadErrorCode,
} from "@/lib/campus-map/place-photos-contract";

const ROLE_PROMPTS: Record<CampusMapPinType, CampusMapPlacePhotoRole[]> = {
  classroom: ["entrance", "interior", "equipment"],
  toilet: ["entrance", "accessibility", "overview"],
  "common-space": ["entrance", "overview", "equipment"],
  printer: ["entrance", "equipment", "overview"],
  water: ["entrance", "equipment", "accessibility"],
};

const PLACE_PHOTO_UPLOAD_ERROR_MESSAGES = {
  "photo-empty": "这张图片没有内容。",
  "photo-too-large": "每张图片不能超过 5 MB。",
  "photo-type-unsupported": "只支持 JPEG、PNG 或 WebP 图片。",
  "photo-dimensions-too-large": "图片尺寸太大，请缩小后再试。",
  "photo-processing-failed": "图片无法读取，请重新导出或选择另一张图片。",
  "photo-upload-rate-limited": "上传太频繁，请稍后再试。",
  "photo-upload-failed": "图片上传失败，请检查网络后重试。",
  "photo-invalid-id": "图片上传状态已失效，请重新选择图片。",
} satisfies Record<CampusMapPlacePhotoUploadErrorCode, string>;

function messageForUploadError(code: unknown) {
  if (code === "authentication-required") return "请先登录再上传图片。";
  if (
    typeof code === "string" &&
    Object.hasOwn(PLACE_PHOTO_UPLOAD_ERROR_MESSAGES, code)
  ) {
    return PLACE_PHOTO_UPLOAD_ERROR_MESSAGES[
      code as CampusMapPlacePhotoUploadErrorCode
    ];
  }
  return "图片暂时无法上传，请稍后再试。";
}

function nextRole(
  pinType: CampusMapPinType,
  photos: readonly CampusMapEditPhoto[],
) {
  const roles = ROLE_PROMPTS[pinType];
  return (
    roles.find((role) => !photos.some((photo) => photo.role === role)) ??
    roles[photos.length % roles.length]
  );
}

export function PlacePhotoEditor({
  pinType,
  photos,
  disabled,
  onChange,
  onPendingChange,
}: {
  pinType: CampusMapPinType;
  photos: CampusMapEditPhoto[];
  disabled?: boolean;
  onChange(photos: CampusMapEditPhoto[]): void;
  onPendingChange?(pending: boolean): void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recommendedRoles = ROLE_PROMPTS[pinType];

  async function upload(files: File[]) {
    const remaining = CAMPUS_MAP_PLACE_PHOTO_MAX_COUNT - photos.length;
    const selected = files.slice(0, remaining);
    if (selected.length === 0) return;
    const tooLarge = selected.find(
      (file) => file.size > CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES,
    );
    if (tooLarge) {
      setError(messageForUploadError("photo-too-large"));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError(null);
    setUploading(true);
    onPendingChange?.(true);
    let nextPhotos = [...photos];
    try {
      for (const file of selected) {
        const assetId = window.crypto.randomUUID();
        const form = new FormData();
        form.set("assetId", assetId);
        form.set("photo", file);
        const response = await fetch("/api/campus-map/place-photos", {
          method: "POST",
          body: form,
        });
        const result = (await response.json().catch(() => null)) as {
          status?: string;
          code?: string;
          asset?: CampusMapPlacePhotoAssetView;
        } | null;
        if (!response.ok || result?.status !== "uploaded" || !result.asset) {
          throw new Error(result?.code ?? result?.status ?? "upload-failed");
        }
        nextPhotos = [
          ...nextPhotos,
          {
            assetId: result.asset.id,
            role: nextRole(pinType, nextPhotos),
          },
        ];
        onChange(nextPhotos);
      }
    } catch (uploadError) {
      setError(
        messageForUploadError(
          uploadError instanceof Error ? uploadError.message : "upload-failed",
        ),
      );
    } finally {
      setUploading(false);
      onPendingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <fieldset
      data-edit-field="photos"
      tabIndex={-1}
      className="rounded-xl border border-black/10 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
    >
      <legend className="px-1 text-sm font-medium">地点照片（可选）</legend>
      <p className="text-xs leading-5 text-neutral-600">
        最多 3 张。建议拍：
        {recommendedRoles.map(campusMapPlacePhotoRoleLabel).join("、")}。
        请避开可识别的人脸、证件和私人信息。
      </p>

      {photos.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <li key={photo.assetId} className="min-w-0">
              <div className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
                <Image
                  unoptimized
                  fill
                  sizes="160px"
                  className="object-cover"
                  src={campusMapPlacePhotoUrl(photo.assetId, "thumbnail")}
                  alt={`第 ${index + 1} 张地点照片预览`}
                />
                <button
                  type="button"
                  disabled={disabled || uploading}
                  aria-label={`移除第 ${index + 1} 张地点照片`}
                  className="absolute top-1 right-1 grid size-9 place-items-center rounded-full bg-black/70 text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                  onClick={() =>
                    onChange(photos.filter((item) => item !== photo))
                  }
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </button>
              </div>
              <label className="mt-1 block text-xs">
                <span className="sr-only">第 {index + 1} 张照片内容</span>
                <select
                  className="min-h-10 w-full rounded-lg border border-black/15 bg-white px-2"
                  value={photo.role}
                  disabled={disabled || uploading}
                  onChange={(event) =>
                    onChange(
                      photos.map((item) =>
                        item === photo
                          ? {
                              ...item,
                              role: event.target
                                .value as CampusMapPlacePhotoRole,
                            }
                          : item,
                      ),
                    )
                  }
                >
                  {CAMPUS_MAP_PLACE_PHOTO_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {campusMapPlacePhotoRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
              {photos.length > 1 ? (
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    disabled={disabled || uploading || index === 0}
                    aria-label={`将第 ${index + 1} 张地点照片前移`}
                    className="grid min-h-10 place-items-center rounded-lg border border-black/15 bg-white hover:bg-neutral-50 disabled:opacity-35"
                    onClick={() => {
                      const next = [...photos];
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      onChange(next);
                    }}
                  >
                    <ChevronLeftIcon aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={
                      disabled || uploading || index === photos.length - 1
                    }
                    aria-label={`将第 ${index + 1} 张地点照片后移`}
                    className="grid min-h-10 place-items-center rounded-lg border border-black/15 bg-white hover:bg-neutral-50 disabled:opacity-35"
                    onClick={() => {
                      const next = [...photos];
                      [next[index], next[index + 1]] = [
                        next[index + 1],
                        next[index],
                      ];
                      onChange(next);
                    }}
                  >
                    <ChevronRightIcon aria-hidden="true" className="size-4" />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        className="sr-only"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        disabled={
          disabled ||
          uploading ||
          photos.length >= CAMPUS_MAP_PLACE_PHOTO_MAX_COUNT
        }
        onChange={(event) => void upload(Array.from(event.target.files ?? []))}
      />
      <label
        htmlFor={inputId}
        aria-disabled={
          disabled ||
          uploading ||
          photos.length >= CAMPUS_MAP_PLACE_PHOTO_MAX_COUNT
        }
        className={cn(
          "mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#176346]/50 px-3 text-sm font-semibold text-[#176346] hover:bg-[#edf5f1] focus-within:ring-2 focus-within:ring-[#176346]",
          (disabled ||
            uploading ||
            photos.length >= CAMPUS_MAP_PLACE_PHOTO_MAX_COUNT) &&
            "pointer-events-none opacity-50",
        )}
      >
        {uploading ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-4 animate-spin"
          />
        ) : (
          <ImagePlusIcon aria-hidden="true" className="size-4" />
        )}
        {uploading
          ? "正在处理图片…"
          : photos.length >= CAMPUS_MAP_PLACE_PHOTO_MAX_COUNT
            ? "已达到 3 张上限"
            : `添加照片（${photos.length}/3）`}
      </label>
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
