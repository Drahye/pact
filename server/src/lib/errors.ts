/** Errors that are safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Sign in to continue.') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You can’t do that.') => new AppError(403, 'forbidden', message);
export const notFound = (what = 'That') => new AppError(404, 'not_found', `${what} could not be found.`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooMany = (message = 'Too many attempts. Try again in a few minutes.') => new AppError(429, 'rate_limited', message);
