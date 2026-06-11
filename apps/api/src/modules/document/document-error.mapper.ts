import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@amic-vault/shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function standardErrorCode(value: unknown): ErrorCode | undefined {
  return typeof value === 'string' && ERROR_CODES.includes(value as ErrorCode)
    ? (value as ErrorCode)
    : undefined;
}

export function errorCodeFromUnknown(error: unknown): ErrorCode {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isRecord(response)) {
      const code = standardErrorCode(response.code);
      if (code) return code;
    }
    const status = error.getStatus();
    if (status === HttpStatus.UNAUTHORIZED) return 'AUTH_REQUIRED';
    if (status === HttpStatus.FORBIDDEN || status === HttpStatus.NOT_FOUND) {
      return 'PERMISSION_DENIED';
    }
    if (status === HttpStatus.UNSUPPORTED_MEDIA_TYPE) return 'UNSUPPORTED_FILE_TYPE';
  }
  return 'VALIDATION_FAILED';
}

function exceptionFor(code: ErrorCode, fallbackStatus = HttpStatus.BAD_REQUEST): HttpException {
  if (code === 'AUTH_REQUIRED') return new UnauthorizedException({ code });
  if (code === 'PERMISSION_DENIED') return new ForbiddenException({ code });
  if (code === 'ETHICAL_WALL_BLOCKED') return new ForbiddenException({ code });
  if (code === 'TENANT_ISOLATION_VIOLATION') return new ForbiddenException({ code });
  if (code === 'UNSUPPORTED_FILE_TYPE') return new UnsupportedMediaTypeException({ code });
  if (fallbackStatus >= 500) return new InternalServerErrorException({ code });
  return new BadRequestException({ code });
}

export function mapDocumentUploadError(error: unknown): HttpException {
  if (error instanceof HttpException) {
    const code = errorCodeFromUnknown(error);
    const response = error.getResponse();
    if (isRecord(response) && standardErrorCode(response.code)) return error;
    return exceptionFor(code, error.getStatus());
  }
  return exceptionFor('VALIDATION_FAILED', HttpStatus.INTERNAL_SERVER_ERROR);
}
