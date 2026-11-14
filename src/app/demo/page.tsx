import { ShootFlow } from "@/components/ShootFlow";

export const metadata = { title: "Demo" };

/** The whole flow on sample data: no camera, no network, no AI. A backup for the judges' table. */
export default function DemoPage() {
  return <ShootFlow demo />;
}
