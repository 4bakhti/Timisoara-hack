import { z } from "zod";
import { ImageData, Lang, ShotIdea } from "./contracts";

export const PoseRequest = z.object({ image: ImageData, lang: Lang.default("en") });
/** null means there is no clearly visible, poseable person in this frame. */
export const PoseResponse = z.object({ idea: ShotIdea.nullable() });
