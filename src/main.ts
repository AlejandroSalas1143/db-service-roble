import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*', // Permite todas las URLs. ⚠️ Úsalo con cuidado en producción
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Si necesitas enviar cookies o headers con auth
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
