import { ShootFlow } from "@/components/ShootFlow";
import { roundLabel } from "@/state/round";

export const metadata = { title: "Shoot" };

/** `/shoot?round=round-1` labels feedback from a user-testing round. Anything else is ignored. */
export default async function ShootPage(props: PageProps<"/shoot">) {
  const { round } = await props.searchParams;
  return <ShootFlow round={roundLabel(round)} />;
}
