// The entry `pnpm bundle:extension` bundles into pi-extension/a2ui-core.bundle.js:
// the three names the `view` tool's a2ui check uses, with everything they reach,
// so the packaged extension checks a payload with no `node_modules` beside it.
// Not a module anything imports.
export { Catalog, MessageProcessor, STRICT_VALIDATION } from "@a2ui/web_core";
