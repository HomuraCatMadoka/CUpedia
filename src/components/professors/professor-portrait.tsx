"use client";

import { useState } from "react";

import {
  formatProfessorNameText,
  getProfessorInitials,
} from "@/lib/professor-name-format";
import type { ProfessorPortrait as ProfessorPortraitAsset } from "@/lib/professor-portrait-assets";

/** 教授头像：优先展示官方照片，加载失败回退到占位首字母（不含职称）。 */
export function ProfessorPortrait({
  portrait,
  name,
  variant = "portrait",
}: {
  portrait: ProfessorPortraitAsset | null;
  name: string;
  variant?: "portrait" | "icon" | "directory";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const displayName = formatProfessorNameText(name);
  const initials = getProfessorInitials(name);
  const failed = portrait !== null && failedSrc === portrait.src256;

  return (
    <div
      className={
        variant === "directory"
          ? "relative size-20 shrink-0 overflow-hidden rounded-full bg-secondary sm:size-32"
          : variant === "icon"
            ? "relative size-14 shrink-0 overflow-hidden rounded-full bg-secondary"
            : "relative aspect-[4/5] w-32 overflow-hidden rounded-xl bg-secondary sm:w-36"
      }
    >
      {!portrait || failed ? (
        <div
          role="img"
          aria-label={`${displayName} 的头像占位`}
          className={`flex size-full items-center justify-center font-medium tracking-[-0.04em] text-muted-foreground ${variant === "icon" ? "text-lg" : variant === "directory" ? "text-xl sm:text-2xl" : "text-2xl"}`}
        >
          {initials}
        </div>
      ) : (
        // These immutable WebP files are already resized in our object storage.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={portrait.src256}
          srcSet={`${portrait.src256} 256w, ${portrait.src384} 384w`}
          alt={`${displayName} 的官方头像`}
          width={portrait.width256}
          height={portrait.height256}
          loading={variant === "portrait" ? "eager" : "lazy"}
          fetchPriority={variant === "portrait" ? "high" : "auto"}
          decoding="async"
          sizes={
            variant === "icon"
              ? "56px"
              : variant === "directory"
                ? "(min-width: 640px) 128px, 80px"
                : "(min-width: 640px) 144px, 128px"
          }
          onError={() => setFailedSrc(portrait.src256)}
          className="size-full object-cover grayscale-[15%]"
        />
      )}
    </div>
  );
}
