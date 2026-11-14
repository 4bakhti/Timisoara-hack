import { randomInt } from "node:crypto";
import { z } from "zod";
import { RecipeCreateRequest } from "@/lib/contracts";
import { cleanText } from "./http";

const text = (max: number) => z.string().max(512).transform(cleanText).pipe(z.string().min(1).max(max));
const coordinate = (min: number, max: number) => z.number().min(min).max(max).transform(n => Math.round(n * 10_000) / 10_000);
export const RecipeBody = RecipeCreateRequest.extend({
  title: text(80),
  place: z.string().max(512).transform(cleanText).pipe(z.string().max(80)).optional(),
  lat: coordinate(-90, 90).optional(),
  lng: coordinate(-180, 180).optional(),
}).refine(body => (body.lat === undefined) === (body.lng === undefined));

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export function newRecipeId(): string {
  return Array.from({ length: 16 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export const recipeId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const nearQuery = z.object({
  lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180),
});
