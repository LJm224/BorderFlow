import { createApplication } from './app-factory';

async function bootstrap() {
  const app = await createApplication();
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
