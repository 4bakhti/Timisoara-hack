import { RecipeView } from "@/components/RecipeView";

export const metadata = { title: "Recipe" };

/** The address a recipe's link and QR code point to. */
export default async function RecipePage(props: PageProps<"/r/[id]">) {
  const { id } = await props.params;
  return <RecipeView id={id} />;
}
