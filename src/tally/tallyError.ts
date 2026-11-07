/**
 * Tally Configuration
 * Centralized configuration for Tally server connection and error handling
 */

import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

export const TALLY_URL = process.env.TALLY_URL as string;

export const TALLY_REQUEST_TIMEOUT = 60000; // 60 seconds

/**
 * Tally Error Messages
 */
export const TALLY_ERROR_MESSAGES = {
  LOGIN_REQUIRED: 'Please Login to Tally',
  REQUEST_TIMEOUT:
    'Tally request timed out. Please ensure Tally is open and accessible.',
  CONNECTION_FAILED:
    'Unable to connect to Tally server. Please ensure Tally is running and accessible at the configured URL.',
  SERVER_NOT_FOUND:
    'Tally server not found. Please check the Tally URL configuration.',
  CONNECTION_ERROR: 'Error connecting to Tally server.',
  NO_RESPONSE:
    'No response from Tally server. Please ensure Tally is open and accessible.',
  DEFAULT_ERROR: 'Make sure Tally is open and logged in.',
} as const;

/**
 * Handle Tally-related errors and throw appropriate exceptions
 */
export function handleTallyError(error: any): never {
  // Re-throw BadRequestException as is
  if (error instanceof BadRequestException) {
    throw error;
  }

  // Handle request timeout (axios timeout)
  if (error.code === 'ECONNABORTED') {
    throw new InternalServerErrorException(
      TALLY_ERROR_MESSAGES.REQUEST_TIMEOUT,
    );
  }

  // Handle connection timeout (unable to connect to server)
  if (
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNREFUSED' ||
    error.message?.includes('ETIMEDOUT') ||
    error.message?.includes('ECONNREFUSED')
  ) {
    throw new InternalServerErrorException(
      TALLY_ERROR_MESSAGES.CONNECTION_FAILED,
    );
  }

  // Handle network errors
  if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
    throw new InternalServerErrorException(
      TALLY_ERROR_MESSAGES.SERVER_NOT_FOUND,
    );
  }

  // Handle axios errors with response
  if (error.response) {
    throw new InternalServerErrorException(
      error.response.data?.message || TALLY_ERROR_MESSAGES.CONNECTION_ERROR,
    );
  }

  // Handle axios errors without response
  if (error.request) {
    throw new InternalServerErrorException(TALLY_ERROR_MESSAGES.NO_RESPONSE);
  }

  // Default error
  throw new InternalServerErrorException(
    error?.message || TALLY_ERROR_MESSAGES.DEFAULT_ERROR,
  );
}
