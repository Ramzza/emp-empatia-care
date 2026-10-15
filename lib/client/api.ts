export async function api<T>(path: string, options: RequestInit = {}, csrfToken = ""): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("Content-Type", "application/json");
  if (csrfToken && options.method && options.method !== "GET") {
    headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = typeof result === "object" && result !== null &&
      "error" in result && typeof result.error === "string"
      ? result.error : "A apărut o eroare. Încearcă din nou.";
    throw new Error(message);
  }
  return result as T;
}
