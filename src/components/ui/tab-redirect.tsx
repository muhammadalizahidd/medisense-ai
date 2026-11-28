import { Suspense } from "react";
import { redirect } from "next/navigation";

type Params = Promise<Record<string, string | string[] | undefined>>;

async function Go({
  to,
  tab,
  searchParams,
}: {
  to: string;
  tab: string;
  searchParams: Params;
}): Promise<never> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, v);
    }
  }
  query.set("tab", tab);
  return redirect(`${to}?${query.toString()}`);
}

/**
 * Sends an old page to the tab that replaced it, keeping the rest of the address, so a page opened
 * inside a phone or tablet app (embed=1) stays without the staff menu.
 */
export function TabRedirect(props: { to: string; tab: string; searchParams: Params }) {
  return (
    <Suspense fallback={null}>
      <Go {...props} />
    </Suspense>
  );
}
