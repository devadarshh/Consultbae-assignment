/**
 * API entrypoint. Fastify + CORS + multipart + JSON error handler.
 *
 * Run with: npm run api   (tsx apps/api/src/server.ts)
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config';
import { registerAudioRoutes } from './routes/audio';
import { registerPeopleRoutes } from './routes/people';

async function main() {
  const app = Fastify({ logger: true, bodyLimit: config.maxUploadBytes });

  await app.register(cors, { origin: config.webOrigin });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

  // Centralized error handling: never leak stack traces to clients.
  app.setErrorHandler((err, _req, reply) => {
    const e = err as { statusCode?: number; code?: string; validation?: unknown };
    if (e.statusCode === 413 || e.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: 'File too large' });
    }
    if (e.validation) {
      return reply.code(400).send({ error: 'Invalid request' });
    }
    if (e.code === 'FST_REQ_BODY_TOO_LARGE') {
      return reply.code(413).send({ error: 'Body too large' });
    }
    app.log.error(err);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  registerAudioRoutes(app);
  registerPeopleRoutes(app);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`API listening on http://localhost:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});