import "server-only";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { AuthError } from "./auth";
import { DatabaseUnavailable } from "./db";
import { serverLog } from "./log";

/** A failure the person can act on, with copy safe to show on screen. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export const objectId = z
  .string()
  .refine((value) => ObjectId.isValid(value), "Invalid id")
  .transform((value) => new ObjectId(value));

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new UserFacingError("The request couldn't be read.");
  }
  return schema.parse(body);
}

export function parseId(value: string) {
  if (!ObjectId.isValid(value)) throw new UserFacingError("Not found.", 404);
  return new ObjectId(value);
}

/** Runs a route body and turns known failures into clear JSON errors. */
export async function handle<T>(run: () => Promise<T>) {
  try {
    return NextResponse.json(await run());
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof UserFacingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const where = first?.path.join(".");
      return NextResponse.json(
        { error: where ? `Check ${where}: ${first?.message}` : "Some details are missing." },
        { status: 400 },
      );
    }
    if (error instanceof DatabaseUnavailable) {
      serverLog(error.message);
      return NextResponse.json(
        { error: "The service can't reach its database right now. Try again shortly." },
        { status: 503 },
      );
    }
    serverLog(`Unexpected error: ${error instanceof Error ? error.message : "unknown"}`);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
