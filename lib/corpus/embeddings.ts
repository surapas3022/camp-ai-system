export interface QueryEmbeddingProvider {
  embedQueries(texts: string[]): Promise<number[][]>;
}

const MODEL = "Xenova/multilingual-e5-small";

export class LocalE5QueryEmbeddingProvider implements QueryEmbeddingProvider {
  private extractorPromise: Promise<any> | undefined;

  constructor(private readonly cacheDir: string) {}

  async embedQueries(texts: string[]): Promise<number[][]> {
    this.extractorPromise ??= this.createExtractor();
    const extractor = await this.extractorPromise;
    const vectors: number[][] = [];
    for (const text of texts) {
      const output = await extractor(`query: ${text}`, { pooling: "mean", normalize: true });
      vectors.push(Array.from(output.data as Float32Array));
    }
    return vectors;
  }

  private async createExtractor() {
    const { env, pipeline } = await import("@huggingface/transformers");
    env.cacheDir = this.cacheDir;
    return pipeline("feature-extraction", MODEL, { revision: "main", dtype: "q8" });
  }
}
