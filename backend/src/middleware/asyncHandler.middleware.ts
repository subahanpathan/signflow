import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async route handler so that any rejected promise (or thrown error)
 * is forwarded to Express's error-handling middleware via next(err) instead of
 * escaping as an unhandled rejection / uncaught exception that could crash
 * the whole server.
 *
 * Even though our handlers already use try/catch, this is a systemic safety
 * net: every route handler is wrapped so that NO rejected promise can ever
 * escape uncaught.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => any) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
