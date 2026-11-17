import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson, UserFacingError } from "@/server/http";
import { changePhoto, photoSchema, readPhoto } from "@/server/photos";

type Params = { params: Promise<{ owner: string; id: string }> };

function ownerOf(value: string) {
  if (value === "therapist" || value === "client") return value;
  throw new UserFacingError("Not found.", 404);
}

/** The image itself. URLs carry a version, so a browser can keep each one. */
export async function GET(_: Request, { params }: Params) {
  const { owner, id } = await params;
  try {
    const user = await requireUser();
    const found = await readPhoto(user, ownerOf(owner), parseId(id));
    if (!found) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(found.bytes), {
      headers: {
        "Content-Type": found.type,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

/** Upload or replace a photo; `{ photo: null }` removes it. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { owner, id } = await params;
    const { photo } = await readJson(request, photoSchema);
    return changePhoto(user, ownerOf(owner), parseId(id), photo);
  });
}
