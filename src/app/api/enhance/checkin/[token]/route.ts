import { z } from "zod";
import { checkinLink, checkinLinkSubmit } from "@/server/enhance-more";
import { handle, readJson } from "@/server/http";

type Params = { params: Promise<{ token: string }> };

/** A pre-visit check-in by secure link, no account: nothing shows until the date of birth matches. */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const dob = new URL(request.url).searchParams.get("dob");
    return checkinLink((await params).token, dob);
  });
}

const schema = z.object({
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  respondent: z.object({
    name: z.string().trim().min(2).max(80),
    relationship: z.string().trim().max(60),
  }),
  answers: z.record(
    z.string(),
    z.union([z.string().max(1500), z.boolean(), z.record(z.string(), z.string().max(1000))]),
  ),
});

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const body = await readJson(request, schema);
    return checkinLinkSubmit((await params).token, body.dob, body.answers, body.respondent);
  });
}
