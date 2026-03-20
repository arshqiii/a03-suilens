import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { db } from "./db";
import { lenses } from "./db/schema";
import { eq } from "drizzle-orm";

const lensSchema = t.Object({
  id: t.String({ format: "uuid" }),
  modelName: t.String(),
  manufacturerName: t.String(),
  minFocalLength: t.Number(),
  maxFocalLength: t.Number(),
  maxAperture: t.String(),
  mountType: t.String(),
  dayPrice: t.String(),
  weekendPrice: t.String(),
  description: t.Union([t.String(), t.Null()]),
});

const errorSchema = t.Object({
  error: t.String(),
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
          title: "Suilens Catalog Service API",
          version: "1.0.0",
          description: "Catalog service API for lens listing and lookup.",
        },
      },
    }),
  )
  .get("/api/lenses", async () => db.select().from(lenses), {
    detail: {
      tags: ["Catalog"],
      summary: "Get all lenses",
      description: "Returns all rental lenses from catalog database.",
    },
    response: t.Array(lensSchema),
  })
  .get(
    "/api/lenses/:id",
    async ({ params, set }) => {
      const results = await db
        .select()
        .from(lenses)
        .where(eq(lenses.id, params.id));
      if (!results[0]) {
        set.status = 404;
        return { error: "Lens not found" };
      }
      return results[0];
    },
    {
      detail: {
        tags: ["Catalog"],
        summary: "Get lens by id",
        description: "Returns a single lens when id exists.",
      },
      params: t.Object({
        id: t.String({ format: "uuid" }),
      }),
      response: {
        200: lensSchema,
        404: errorSchema,
      },
    },
  )
  .get("/health", () => ({ status: "ok", service: "catalog-service" }), {
    detail: {
      tags: ["Health"],
      summary: "Health check",
      description: "Service liveness endpoint.",
    },
    response: healthSchema,
  })
  .listen(3001);

console.log(`Catalog Service running on port ${app.server?.port}`);
