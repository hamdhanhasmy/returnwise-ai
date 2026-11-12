export class RenderApi {
  constructor(private key = process.env.RENDER_API_KEY) {
    if (!key || key.length < 10)
      throw Error("Privately configure RENDER_API_KEY in .env.render");
  }
  async request(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    const response = await fetch(`https://api.render.com/v1${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${this.key}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      // Responses may echo environment values. Never log response bodies, headers or requests.
      throw Error(
        response.status === 402
          ? "Render requires payment; stopped with no paid fallback"
          : `Render API request rejected (HTTP ${response.status}); response values withheld`,
      );
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
}
