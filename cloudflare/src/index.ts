export interface Env {
  GAME_ROOMS: DurableObjectNamespace;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

const jsonResponse = (data: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers ?? {});
  headers.set("content-type", "application/json");
  Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
};

const noContent = (status = 204): Response =>
  new Response(null, {
    status,
    headers: CORS_HEADERS
  });

const notFound = (): Response =>
  jsonResponse(
    {
      error: "Not found"
    },
    { status: 404 }
  );

const badRequest = (message: string): Response =>
  jsonResponse(
    {
      error: message
    },
    { status: 400 }
  );

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname === "/api/games" && request.method === "POST") {
      const id = env.GAME_ROOMS.newUniqueId();
      const stub = env.GAME_ROOMS.get(id);
      const initResponse = await stub.fetch("https://internal/init", { method: "POST" });
      if (!initResponse.ok) {
        const text = await initResponse.text();
        return jsonResponse({ error: text || "Failed to initialize game" }, { status: 500 });
      }
      return jsonResponse({ id: id.toString() }, { status: 201 });
    }

    if (url.pathname.startsWith("/api/games/") && request.method === "GET") {
      const segments = url.pathname.split("/");
      const gameId = segments[3];
      if (!gameId) {
        return notFound();
      }
      let durableId: DurableObjectId;
      try {
        durableId = env.GAME_ROOMS.idFromString(gameId);
      } catch {
        return notFound();
      }
      const stub = env.GAME_ROOMS.get(durableId);
      const response = await stub.fetch("https://internal/summary");
      if (response.status === 404) {
        return notFound();
      }
      if (!response.ok) {
        const text = await response.text();
        return jsonResponse({ error: text || "Unable to load game" }, { status: 500 });
      }
      const summary = await response.json();
      return jsonResponse(summary);
    }

    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      const gameId = url.searchParams.get("gameId");
      if (!gameId) {
        return badRequest("Missing gameId");
      }
      let durableId: DurableObjectId;
      try {
        durableId = env.GAME_ROOMS.idFromString(gameId);
      } catch {
        return notFound();
      }
      const stub = env.GAME_ROOMS.get(durableId);
      return stub.fetch(request);
    }

    return notFound();
  }
};

function handleOptions(request: Request): Response {
  if (
    request.headers.get("Origin") !== null &&
    request.headers.get("Access-Control-Request-Method") !== null
  ) {
    return noContent();
  }
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET,POST,OPTIONS"
    }
  });
}

export { GameRoomDurableObject } from "./durableObjects/gameRoom";
