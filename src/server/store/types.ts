import type { EventsRequest, FeedbackRequest, Recipe, Stats } from "@/lib/contracts";

export type StorageMode = NonNullable<Stats["storage"]>;
export type Position = { lat: number; lng: number };
export type VersionStats = Stats["versions"][number];

export interface Store {
  readonly mode: StorageMode;
  recordEvents(request: EventsRequest): Promise<void>;
  saveFeedback(request: FeedbackRequest): Promise<void>;
  stats(round?: string): Promise<Stats>;
  /** Returns false for an ID collision. */
  insertRecipe(recipe: Recipe): Promise<boolean>;
  listRecipes(near?: Position): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | null>;
  useRecipe(id: string): Promise<boolean>;
  hideRecipe(id: string): Promise<boolean>;
}
