import { buildApp } from './app';
import { config } from './config';

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`API listening on http://localhost:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});