import * as React from "react";

import { toast } from "sonner";

export type UploadedFile = {
  key: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

export function useUploadFile() {
  const [uploadedFile, setUploadedFile] = React.useState<UploadedFile>();
  const [uploadingFile, setUploadingFile] = React.useState<File>();
  const [progress, setProgress] = React.useState<number>(0);
  const [isUploading, setIsUploading] = React.useState(false);

  async function uploadFile(file: File) {
    setIsUploading(true);
    setUploadingFile(file);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      setProgress(50);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Upload failed");
      }

      const { url } = (await res.json()) as { url: string };
      setProgress(100);

      const uploaded: UploadedFile = {
        key: url,
        name: file.name,
        size: file.size,
        type: file.type,
        url,
      };

      setUploadedFile(uploaded);
      return uploaded;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      toast.error(message);
    } finally {
      setProgress(0);
      setIsUploading(false);
      setUploadingFile(undefined);
    }
  }

  return {
    isUploading,
    progress,
    uploadedFile,
    uploadFile,
    uploadingFile,
  };
}
