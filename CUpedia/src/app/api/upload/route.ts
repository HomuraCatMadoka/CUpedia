import { auth } from "@/lib/auth";
import { uploadFile } from "@/lib/minio";
import { NextResponse } from "next/server";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({}, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "文件大小不能超过 5MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadFile(buffer, file.name, file.type);

  return NextResponse.json({ url });
}
