import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { StatesService } from './states.service';

@Controller('states')
export class StatesController {
  constructor(private readonly statesService: StatesService) {}

  @Get()
  async list(@Res() res: Response) {
    try {
      const states = await this.statesService.findAll();
      return res.status(HttpStatus.OK).json({
        success: true,
        data: states,
      });
    } catch (error: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error?.message || 'Failed to fetch states',
      });
    }
  }
}
