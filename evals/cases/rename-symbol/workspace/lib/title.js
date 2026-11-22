import { capitalise } from "./strings.js";

export const title = (words) => words.map(capitalise).join(" ");
