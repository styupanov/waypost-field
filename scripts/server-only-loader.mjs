const emptyServerOnlyUrl = new URL("./empty-server-only.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: emptyServerOnlyUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
