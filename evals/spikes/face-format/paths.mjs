// Face-format experiment harness, not a test. Where a run's answers are.
import path from "node:path";
export const HERE = import.meta.dirname;
export const OUT = process.env.FACE_OUT ?? path.join(HERE, "../../../recordings/face-format");
export const REPS = Number(process.env.REPS ?? 3);
export const MODELS = (process.env.MODELS ?? "haiku-5-5 sonnet-5-5 opus-5-5").split(" ");
/** The reply that means "I have nothing to say", which the app would not show. */
export const SILENT = /^\s*(?:\[silent\]|∅)?\s*$/i;
/** A run's directory: <OUT>/<phase>/<model>/<arm>/r<n>. The floor is the control's second half. */
export const repDir = (phase, model, arm, r) => (arm === "floor" ? path.join(OUT, phase, model, "none", `r${r + REPS}`) : path.join(OUT, phase, model, arm, `r${r}`));
