/** Class names shared by every screen, so buttons and cards look and behave the same. */

/** Small rounded button used over the camera. At least 44 px tall for thumbs. */
export const pill =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/55 px-3 text-sm font-medium backdrop-blur active:scale-95 disabled:opacity-50";

export const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-green-400 px-5 py-3.5 text-center text-lg font-semibold text-black active:scale-[0.98] disabled:opacity-50";

export const secondary =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white/10 px-5 py-3 text-center text-base font-medium active:scale-[0.98] disabled:opacity-50";

export const card = "rounded-xl bg-white/5 p-4";

/** Text inputs. 16 px text keeps phone browsers from zooming in on focus. */
export const field =
  "w-full rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-base text-white placeholder:text-neutral-500";

/** Something the user should know before going on: sample data, temporary storage, a refusal. */
export const notice = "rounded-xl bg-amber-400/15 p-3 text-sm leading-snug text-amber-200";

/** A plain page (not the camera): centred column that respects the phone's safe areas. */
export const shell =
  "mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]";
