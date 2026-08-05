"use client";

import Image from "next/image";
import { useState } from "react";

export function ProfessorPortrait({
  imageUrl,
  name,
  variant = "portrait",
}: {
  imageUrl: string | null;
  name: string;
  variant?: "portrait" | "icon" | "directory";
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <div
      className={
        variant === "directory"
          ? "relative size-28 shrink-0 overflow-hidden rounded-full bg-secondary sm:size-32"
          : variant === "icon"
            ? "relative size-14 shrink-0 overflow-hidden rounded-full bg-secondary"
            : "relative aspect-[4/5] w-32 overflow-hidden rounded-xl bg-secondary sm:w-36"
      }
    >
      {!imageUrl || failed ? (
        <div
          role="img"
          aria-label={`${name} 的头像占位`}
          className={`flex size-full items-center justify-center font-medium tracking-[-0.04em] text-muted-foreground ${variant === "icon" ? "text-lg" : "text-2xl"}`}
        >
          {initials}
        </div>
      ) : (
        <Image
          src={imageUrl}
          alt={`${name} 的院系头像`}
          fill
          priority={variant === "portrait"}
          sizes={
            variant === "icon"
              ? "56px"
              : variant === "directory"
                ? "(min-width: 640px) 128px, 112px"
                : "(min-width: 640px) 144px, 128px"
          }
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="object-cover grayscale-[15%]"
        />
      )}
    </div>
  );
}
