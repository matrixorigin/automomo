export async function proxyAutomomoRequest(request: Request) {
  const baseUrl = (process.env.AUTOMOMO_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
  const source = new URL(request.url);
  const targetPath = source.pathname.replace(/^\/api/, "/api");
  const targetUrl = `${baseUrl}${targetPath}${source.search}`;
  const headers = new Headers();
  for (const key of ["content-type", "authorization", "x-github-event", "x-hub-signature-256"]) {
    const value = request.headers.get(key);
    if (value) {
      headers.set(key, value);
    }
  }
  return fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    cache: "no-store"
  });
}
