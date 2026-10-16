import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AudioSocketGateway } from './calling/ai-voice/audiosocket.gateway';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const allowedOrigins = [
    'http://localhost:5173',
    'https://ai-sales-agent-azure.vercel.app',
    configService.get<string>('FRONTEND_URL'),
  ].filter((origin): origin is string => !!origin);

  app.enableCors({
    origin: [...new Set(allowedOrigins)],
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Asterisk's AudioSocket carries live call audio over its own raw TCP
  // port — not HTTP/WebSocket, so it can't attach to Nest's HTTP server the
  // way Socket.IO does. Listens independently (see
  // calling/ai-voice/audiosocket.gateway.ts).
  app.get(AudioSocketGateway).listen();

  const port = configService.get<string>('PORT') ?? 3000;
  await app.listen(port);
}
void bootstrap();
