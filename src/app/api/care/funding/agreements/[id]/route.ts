import { requireUser } from "@/server/auth";
import { agreementAction, agreementActionSchema, agreementDetail } from "@/server/agreements";
import { canVerify, canEditFunding } from "@/server/funding";
import { handle, parseId, readJson } from "@/server/http";

type Params = { params: Promise<{ id: string }> };

/** The agreement builder: lines, terms, review, issue and history. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin");
    return {
      ...(await agreementDetail(parseId((await params).id))),
      can: { verify: canVerify(user), edit: canEditFunding(user) },
      me: user.name,
    };
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin");
    return agreementAction(
      user,
      parseId((await params).id),
      await readJson(request, agreementActionSchema),
    );
  });
}
