import snapshot from "@/data/corpus.json";
// One immutable generation supplies both registry and passages to every route.
export const sources = snapshot.sources;
export const chunks = snapshot.chunks;
export const corpusGeneration = snapshot.generation;
export const demoMode = sources.some((source) => "demo" in source && source.demo === true);
