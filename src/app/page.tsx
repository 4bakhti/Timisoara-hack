import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

/** Placeholder home screen. The interface workstream replaces this. */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="max-w-sm text-lg opacity-80">{APP_TAGLINE.en}</p>
      <Link href="/lab" className="mt-4 rounded-full border px-5 py-2 text-sm">
        Open the lab
      </Link>
    </main>
  );
}
