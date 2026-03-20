import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { db } from "./db";
import { orders } from "./db/schema";
import { eq } from "drizzle-orm";
import { publishEvent } from "./events";

const CATALOG_SERVICE_URL =
  process.env.CATALOG_SERVICE_URL || "http://localhost:3001";

interface CatalogLens {
  id: string;
  modelName: string;
  manufacturerName: string;
  dayPrice: string;
}

const createOrderSchema = t.Object({
  customerName: t.String(),
  customerEmail: t.String({ format: "email" }),
  lensId: t.String({ format: "uuid" }),
  startDate: t.String(),
  endDate: t.String(),
});

const errorSchema = t.Object({
  error: t.String(),
});

const orderSchema = t.Object({
  id: t.String({ format: "uuid" }),
  customerName: t.String(),
  customerEmail: t.String(),
  lensId: t.String({ format: "uuid" }),
  lensSnapshot: t.Any(),
  startDate: t.Any(),
  endDate: t.Any(),
  totalPrice: t.String(),
  status: t.Union([
    t.Literal("pending"),
    t.Literal("confirmed"),
    t.Literal("active"),
    t.Literal("returned"),
    t.Literal("cancelled"),
  ]),
  createdAt: t.Any(),
});

const healthSchema = t.Object({
  status: t.String(),
  service: t.String(),
});

const app = new Elysia()
  .use(cors())
  .use(
    swagger({
      path: "/openapi",
      documentation: {
        info: {
          title: "Suilens Order Service API",
          version: "1.0.0",
          description: "Order placement and retrieval endpoints.",
        },
      },
    }),
  )
  .post(
    "/api/orders",
    async ({ body, set }) => {
      const lensResponse = await fetch(
        `${CATALOG_SERVICE_URL}/api/lenses/${body.lensId}`,
      );
      if (!lensResponse.ok) {
        set.status = 404;
        return { error: "Lens not found" };
      }
      const lens = (await lensResponse.json()) as CatalogLens;

      const start = new Date(body.startDate);
      const end = new Date(body.endDate);
      const days = Math.ceil(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (days <= 0) {
        set.status = 400;
        return { error: "End date must be after start date" };
      }
      const totalPrice = (days * Number.parseFloat(lens.dayPrice)).toFixed(2);

      const [order] = await db
        .insert(orders)
        .values({
          customerName: body.customerName,
          customerEmail: body.customerEmail,
          lensId: body.lensId,
          lensSnapshot: {
            modelName: lens.modelName,
            manufacturerName: lens.manufacturerName,
            dayPrice: lens.dayPrice,
          },
          startDate: start,
          endDate: end,
          totalPrice,
        })
        .returning();
      if (!order) {
        set.status = 500;
        return { error: "Failed to create order" };
      }

      await publishEvent("order.placed", {
        orderId: order.id,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        lensName: lens.modelName,
      });

      set.status = 201;
      return order;
    },
    {
      detail: {
        tags: ["Orders"],
        summary: "Create order",
        description:
          "Create a new rental order after validating lens existence and date range.",
      },
      body: createOrderSchema,
      response: {
        201: orderSchema,
        400: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
  )
  .get("/api/orders", async () => db.select().from(orders), {
    detail: {
      tags: ["Orders"],
      summary: "Get all orders",
      description: "Returns all orders stored in order database.",
    },
    response: t.Array(orderSchema),
  })
  .get(
    "/api/orders/:id",
    async ({ params, set }) => {
      const results = await db
        .select()
        .from(orders)
        .where(eq(orders.id, params.id));
      if (!results[0]) {
        set.status = 404;
        return { error: "Order not found" };
      }
      return results[0];
    },
    {
      detail: {
        tags: ["Orders"],
        summary: "Get order by id",
        description: "Returns a single order when id exists.",
      },
      params: t.Object({
        id: t.String({ format: "uuid" }),
      }),
      response: {
        200: orderSchema,
        404: errorSchema,
      },
    },
  )
  .get("/health", () => ({ status: "ok", service: "order-service" }), {
    detail: {
      tags: ["Health"],
      summary: "Health check",
      description: "Service liveness endpoint.",
    },
    response: healthSchema,
  })
  .listen(3002);

console.log(`Order Service running on port ${app.server?.port}`);
