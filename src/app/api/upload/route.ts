import { requireEditor } from "@/lib/auth-guard";
import { uploadAsset } from "@/lib/minio";
import { fileTypeFromBuffer } from "file-type";
import { NextResponse } from "next/server";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

export async function POST(req: Request) {
  try {
    await requireEditor();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "文件大小不能超过 5MB" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  const extension = detected && ALLOWED_TYPES.get(detected.mime);
  if (!detected || !extension) {
    return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
  }
  const { url } = await uploadAsset(
    buffer,
    `upload.${extension}`,
    detected.mime,
  );

  return NextResponse.json({ url });
}
