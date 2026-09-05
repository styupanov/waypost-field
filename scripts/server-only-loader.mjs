const emptyServerOnlyUrl = new URL("./empty-server-only.mjs", import.meta.url).href;
const sourceRootUrl = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: emptyServerOnlyUrl, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const relative = specifier.slice(2);
    return { url: new URL(relative.endsWith(".ts") || relative.endsWith(".tsx") ? relative : `${relative}.ts`, sourceRootUrl).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
