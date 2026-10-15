import type { JsonObject } from "./types";

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function json(status: number, data: unknown, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers });
}

export async function readJson(request: Request): Promise<JsonObject> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    let complete = false;
    while (!complete) {
      const part = await reader.read();
      complete = part.done;
      if (part.value) {
        size += part.value.byteLength;
        if (size > 16_384) {
          await reader.cancel();
          throw new HttpError("Request body too large.", 413);
        }
        chunks.push(part.value);
      }
    }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let value: unknown;
  try {
    value = JSON.parse(text || "{}");
  } catch {
    throw new HttpError("Invalid JSON request.", 400);
  }
  if (!isJsonObject(value)) {
    throw new HttpError("Invalid JSON request.", 400);
  }
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
