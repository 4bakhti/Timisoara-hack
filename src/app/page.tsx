import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

const STEPS = [
  ["Read", "Point the camera at anything. The app reads the light, the background and the space."],
  ["Suggest", "It proposes three shots that fit this scene, each with a reason."],
  ["Coach", "Pick one. It guides the photographer on screen and the person in the photo by voice."],
  ["Capture", "When framing and pose match, it counts down and takes the photo. A real one, never generated."],
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-between gap-10 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="pt-10">
        <h1 className="text-5xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-3 text-xl leading-snug text-neutral-300">{APP_TAGLINE.en}</p>
        <p className="mt-1 text-base text-neutral-500">{APP_TAGLINE.ro}</p>
      </header>

      <ol className="grid gap-4">
        {STEPS.map(([title, text], index) => (
          <li key={title} className="flex gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-400 font-semibold text-black">
              {index + 1}
            </span>
            <p className="leading-snug">
              <span className="font-semibold">{title}.</span> <span className="text-neutral-300">{text}</span>
            </p>
          </li>
        ))}
      </ol>

      <div className="grid gap-3">
        <Link href="/shoot" className="rounded-full bg-green-400 px-5 py-4 text-center text-lg font-semibold text-black">
          Start
        </Link>
        <p className="text-center text-xs text-neutral-500">
          Works in your phone&apos;s browser. Nothing to install.{" "}
          <Link href="/lab" className="underline">
            Lab
          </Link>
        </p>
      </div>
    </main>
  );
}
