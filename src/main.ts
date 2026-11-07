import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded, static as expressStatic } from 'express';
import { join } from 'path';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      // Disable default body parser so we can set a larger limit below
      bodyParser: false,
    });
    const port = process.env.PORT || 3000;

    // Allow large JSON payloads (bulk product totalSalesAmount updates, etc.)
    // Default Express limit is ~100kb — raises 413 "request entity too large"
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true, limit: '50mb' }));
    app.use('/uploads', expressStatic(join(process.cwd(), 'public', 'uploads')));

    // Remove built-in CORS - let middleware handle it
    // app.enableCors();

    // Increase server timeout for long-running operations like vendor sync
    // Default is 2 minutes, increase to 5 minutes (300000ms) for sync operations
    const server = app.getHttpServer();
    server.timeout = 300000; // 5 minutes
    server.keepAliveTimeout = 300000; // 5 minutes
    server.headersTimeout = 300000; // 5 minutes

    await app.listen(port);
    console.log(`🚀 Server is running on: http://localhost:${port}`);
    console.log(`🖼️ Local uploads served from: http://localhost:${port}/uploads`);
    console.log(`📡 CORS enabled for all origins`);
    console.log(`📦 Body size limit set to 50mb`);
    console.log(
      `⏱️ Server timeout set to 5 minutes for long-running operations`,
    );
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}
bootstrap();
