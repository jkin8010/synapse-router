import { pathToFileURL } from "node:url";

import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions
} from "fastify";
import {
  negotiateSchema,
  type NegotiateSchemaInput,
  type NegotiatedSchema
} from "@synapse-router/negotiator";

export type NegotiateSchemaHandler = (input: NegotiateSchemaInput) => Promise<NegotiatedSchema>;

export interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  negotiateSchema?: NegotiateSchemaHandler;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger ?? true
  });
  const negotiate = options.negotiateSchema ?? negotiateSchema;

  server.get("/health", async () => {
    return { status: "ok" };
  });

  server.post("/negotiate", async (request, reply) => {
    const body = request.body;

    if (!isNegotiateBody(body)) {
      return reply.code(400).send({ error: "task and goal are required" });
    }

    return negotiate({
      task: body.task,
      goal: body.goal,
      constraints: body.constraints
    });
  });

  server.post("/execute/:schema_id", async (request) => {
    const { schema_id } = request.params as { schema_id: string };

    return {
      schema_id,
      status: "mocked",
      image_url: `https://example.com/mock-images/${schema_id}.png`
    };
  });

  return server;
}

export async function startServer(): Promise<void> {
  const server = buildServer();
  const port = Number(process.env.PORT ?? 3000);

  try {
    await server.listen({ port, host: "0.0.0.0" });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

function isNegotiateBody(value: unknown): value is NegotiateSchemaInput {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const body = value as Partial<NegotiateSchemaInput>;
  return isNonEmptyString(body.task) && isNonEmptyString(body.goal);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startServer();
}
