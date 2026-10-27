/**
 * Build metadata injected by rollup.config.js.
 *
 * The placeholders are replaced in the bundle, not at runtime. Keeping them in
 * a normal source file lets tests, svelte-check and editors treat this as a
 * plain string module.
 */
export const BUILD_COMMIT = "__LONGFORM_BUILD_COMMIT__";
export const BUILD_TIME = "__LONGFORM_BUILD_TIME__";
