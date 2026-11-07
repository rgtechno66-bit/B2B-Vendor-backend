import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJobType } from '../settings/setting.entity';
import { CronSettingsService } from '../settings/setting.service';

export interface DefaultCronSettings {
  minutes?: number;
  seconds?: number;
  hours?: number;
}

@Injectable()
export class CronSchedulerService {
  private readonly logger = new Logger(CronSchedulerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly cronSettingsService: CronSettingsService,
  ) {}

  /**
   * Generate cron expression from hours, minutes, and seconds
   */
  generateCronExpression(
    minutes: number,
    seconds: number,
    hours: number,
  ): string {
    if (hours > 0) {
      return `0 */${hours} * * *`; // Every X hours
    }
    if (minutes > 0) {
      return `*/${minutes} * * * *`; // Every X minutes
    }
    if (seconds > 0) {
      return `*/${seconds} * * * * *`; // Every X seconds
    }
    return `*/2 * * * * *`; // Default: every 2 seconds
  }

  /**
   * Schedule or reschedule a cron job
   * @param cronJobName - Unique name for the cron job
   * @param cronJobType - Type of cron job from CronJobType enum
   * @param callback - Function to execute when cron job runs
   * @param defaultSettings - Default settings if not found in database (optional)
   * @param jobDescription - Description for logging (optional)
   */
  async scheduleCronJob(
    cronJobName: string,
    cronJobType: CronJobType,
    callback: () => void,
    defaultSettings?: DefaultCronSettings,
    jobDescription?: string,
  ): Promise<void> {
    try {
      // Remove existing cron job if it exists
      if (this.schedulerRegistry.doesExist('cron', cronJobName)) {
        this.schedulerRegistry.deleteCronJob(cronJobName);
      }

      // Get settings from database
      let settings = await this.cronSettingsService.findByType(cronJobType);

      // Create default settings if not exists
      if (!settings) {
        const description = jobDescription || cronJobType;
        this.logger.log(
          `${description} cron settings not found. Creating default settings...`,
        );

        settings = await this.cronSettingsService.createOrUpdate({
          type: cronJobType,
          minutes: defaultSettings?.minutes ?? 0,
          seconds: defaultSettings?.seconds ?? 0,
          hours: defaultSettings?.hours ?? 1,
        });

        this.logger.log(`Default ${description} cron settings created.`);
      }

      // Generate cron expression
      const cronExpression = this.generateCronExpression(
        settings.minutes,
        settings.seconds,
        settings.hours,
      );

      // Create and add the cron job
      const { CronJob } = require('cron');
      const job = new CronJob(cronExpression, callback);

      this.schedulerRegistry.addCronJob(cronJobName, job);
      job.start();

      const description = jobDescription || cronJobType;
      this.logger.log(
        `${description} cron job scheduled: ${cronExpression} (${settings.hours}h ${settings.minutes}m ${settings.seconds}s)`,
      );
    } catch (error) {
      const description = jobDescription || cronJobType;
      this.logger.error(`Error scheduling ${description} cron job:`, error);
    }
  }
}
