"use client";

import Image from "next/image";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { campusMapPlacePhotoRoleLabel } from "@/lib/campus-map/display-registry";
import type { CampusMapPlacePhotoView } from "@/lib/campus-map/place-photos-contract";

export function PlacePhotoGallery({
  photos,
}: {
  photos: CampusMapPlacePhotoView[];
}) {
  if (photos.length === 0) return null;
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {photos.map((photo, index) => (
        <li key={photo.id}>
          <Dialog>
            <DialogTrigger
              aria-label={`查看地点照片：${campusMapPlacePhotoRoleLabel(photo.role)}，第 ${index + 1} 张，共 ${photos.length} 张`}
              className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image
                unoptimized
                fill
                loading="lazy"
                sizes="(max-width: 640px) 50vw, 220px"
                className="object-cover transition-transform hover:scale-[1.02]"
                src={photo.thumbnailUrl}
                alt=""
              />
              <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
                {campusMapPlacePhotoRoleLabel(photo.role)}
              </span>
            </DialogTrigger>
            <DialogContent
              overlayClassName="bg-black/70"
              className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] bg-black p-2 text-white [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:hover:bg-white/20 sm:max-w-4xl"
            >
              <DialogTitle className="sr-only">
                地点照片：{campusMapPlacePhotoRoleLabel(photo.role)}
              </DialogTitle>
              <DialogDescription className="sr-only">
                按 Escape 或关闭按钮返回地点资料。
              </DialogDescription>
              <Image
                unoptimized
                width={photo.width}
                height={photo.height}
                sizes="calc(100vw - 2rem)"
                className="max-h-[calc(100dvh-3rem)] w-full object-contain"
                src={photo.url}
                alt={`${campusMapPlacePhotoRoleLabel(photo.role)}照片`}
              />
            </DialogContent>
          </Dialog>
        </li>
      ))}
    </ul>
  );
}
