import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config';
import { registerAudioRoutes } from './routes/audio';
import { registerPeopleRoutes } from './routes/people';

/** Build a configured Fastify app (used by both the server and the tests). */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: config.maxUploadBytes });

  await app.register(cors, { origin: config.webOrigin });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

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
  return app;
}