const local = process.env.NODE_ENV === "development";

export class globals {
  static readonly graphLLMBackendUrl = local
    ? "http://localhost:9955"
    : "https://api.graphai.one"; //
}

// http://localhost:995
