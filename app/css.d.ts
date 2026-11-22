// A stylesheet imported for its effect: Vite turns the import into the page's
// styles (`app/main.ts`), and there is nothing for TypeScript to type. Narrow
// on purpose — `vite/client`'s declarations would reach every file this config
// checks, `src/` included, which is built without Vite.
declare module "*.css";
