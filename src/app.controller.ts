// src/app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller() // This will handle the root (/) route
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get() // Respond to GET requests on '/'
  getHello(): string {
    return this.appService.getHello();
  }
}
