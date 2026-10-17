import { Request, Response, NextFunction } from 'express';

/** Prevent browsers/CDNs from caching authenticated JSON — stale lists survive Redis clears. */
export function noStoreMiddleware() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization");
    next();
  };
}
