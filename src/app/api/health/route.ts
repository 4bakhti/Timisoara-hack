import { health } from "@/server/env";

export const dynamic = "force-dynamic";

/** Which optional services are configured on this server. */
export function GET() {
  return Response.json(health());
}
