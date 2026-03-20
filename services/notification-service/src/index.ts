import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { startConsumer, type OrderPlacedNotificationEvent } from "./consumer";

const healthSchema = t.Object({
  status: t.String(),
  service: t.String(),
});

type WebSocketClient = { send: (payload: string) => unknown };

const connectedClients = new Set<WebSocketClient>();

function broadcastNotification(event: OrderPlacedNotificationEvent) {
  const payload = JSON.stringify(event);

  for (const client of connectedClients) {
    try {
      client.send(payload);
    } catch (error) {
      console.error(
        "Failed to send websocket notification:",
        (error as Error).message,
      );
    }
  }
}

const app = new Elysia()
  .use(
    swagger({
      path: "/openapi",
      documentation: {
        info: {
          title: "Suilens Notification Service API",
          version: "1.0.0",
          description:
            "Notification health endpoint and websocket stream for live updates.",
        },
      },
    }),
  )
  .ws("/ws/notifications", {
    open(ws: WebSocketClient) {
      connectedClients.add(ws);
      ws.send(
        JSON.stringify({
          event: "ws.connected",
          timestamp: new Date().toISOString(),
          data: {
            message: "Connected to notification stream",
          },
        }),
      );
    },
    close(ws: WebSocketClient) {
      connectedClients.delete(ws);
    },
  })
  .get("/health", () => ({ status: "ok", service: "notification-service" }), {
    detail: {
      tags: ["Health"],
      summary: "Health check",
      description: "Service liveness endpoint.",
    },
    response: healthSchema,
  })
  .listen(3003);

await startConsumer((event) => {
  broadcastNotification(event);
});

console.log(`Notification Service running on port ${app.server?.port}`);
