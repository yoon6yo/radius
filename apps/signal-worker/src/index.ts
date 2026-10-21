import { SignalHub as Hub } from "./hub.ts";

interface Env {
  HUB: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
}

const IP_HEADER = "x-radius-ip";
const MAX_PAYLOAD = 64 * 1024;

/** Browsers always send Origin on WebSocket upgrades, so a missing one is a non-browser client. */
function originAllowed(origin: string | null, host: string, allowed: readonly string[]): boolean {
  if (!origin) return true;
  if (allowed.length > 0) return allowed.includes(origin);
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("ok");
    const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!originAllowed(request.headers.get("Origin"), new URL(request.url).host, allowed)) {
      return new Response("forbidden", { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.set(IP_HEADER, request.headers.get("CF-Connecting-IP") ?? "unknown");
    const stub = env.HUB.get(env.HUB.idFromName("hub"));
    return stub.fetch(new Request(request, { headers }));
  },
};

export class SignalHub {
  private readonly hub = new Hub();

  fetch(request: Request): Response {
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.accept();
    const handle = this.hub.open(
      {
        send: (data) => server.send(data),
        close: (code, reason) => server.close(code, reason),
      },
      request.headers.get(IP_HEADER) ?? "unknown",
    );
    server.addEventListener("message", (e) => {
      if (typeof e.data === "string" && e.data.length > MAX_PAYLOAD) return server.close(1009, "too large");
      handle.message(e.data);
    });
    server.addEventListener("close", () => handle.close());
    server.addEventListener("error", () => handle.close());
    return new Response(null, { status: 101, webSocket: client });
  }
}
