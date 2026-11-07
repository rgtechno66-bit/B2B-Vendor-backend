// src/app.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello Techno Word!'; // Basic hello message, can be expanded
  }
}
