import { handle, readJson } from "@/server/http";
import { publicActionSchema, publicAgreement, publicAgreementAction } from "@/server/agreements";

type Params = { params: Promise<{ token: string }> };

/** The signatory's secure agreement link: no account needed (AT-18, AT-30). */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => ({ agreement: await publicAgreement((await params).token) }));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => ({
    agreement: await publicAgreementAction(
      (await params).token,
      await readJson(request, publicActionSchema),
    ),
  }));
}
