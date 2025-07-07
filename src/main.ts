import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { envs } from './config/envs';
import { createValidationExceptionFactory } from './common/factories/create-validation-exception.factory';
import { SERVICE_NAME } from './config/constants';
import { ServiceIdentifierInterceptor } from './common/interceptors/service-identifier.interceptor';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.NATS,
      options: {
        servers: [envs.NATS_SERVERS],
      },
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: createValidationExceptionFactory(SERVICE_NAME),
    }),
  );

  app.useGlobalInterceptors(
    new ServiceIdentifierInterceptor(SERVICE_NAME),
  );

  await app.listen();
  console.log(`🚀 Microservice User running with NATS on ${envs.NATS_SERVERS}`);
}

bootstrap().catch((err) => {
  console.error('💥 Error fatal durante el bootstrap:', err);
  process.exit(1);
});
