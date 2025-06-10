import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { envs } from './config/envs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/');

  const port = Number(envs.PORT) || 3000;
  await app.listen(port);
  console.log(`Microservice User running on port ${port}`);
}
bootstrap().catch((err) => {
  console.error('💥 Error fatal durante el bootstrap:', err);
  process.exit(1);
});
