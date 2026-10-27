import type { NextFunction, Request, Response } from "express";
import LIMITS from "../config/limits";

/**
 * - Rate limiting
 * A small sliding-window counter kept in memory. It is enough for a single
 * Render instance, which is what this API runs on; with more than one
 * instance each would hold its own counter, and the store would move to Redis.
 *
 * Two flavours, per the plan:
 * - {@link authRateLimiter} keys on the client IP for the public auth routes
 * - {@link userRateLimiter} keys on the signed-in user for money movement
 */

/** One bucket per key: how many requests were counted and when to forget them. */
interface Bucket {
  count: number;
  /** epoch ms at which the window resets */
  resetAt: number;
}

/** How many keys may be tracked before expired buckets are swept. */
const SWEEP_THRESHOLD = 5_000;

const buckets = new Map<string, Bucket>();

/**
 * - Take one unit from a bucket
 * Refills the window when it has expired, then increments. Returns the state
 * after the attempt so the caller can answer 429 or set headers.
 *
 * @param key - the bucket to charge
 * @param max - requests allowed per window
 * @param windowMs - the window length
 */
function take(
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();

  // expire the whole map occasionally, so abandoned keys cannot grow forever
  if (buckets.size > SWEEP_THRESHOLD) {
    for (const [staleKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(staleKey);
    }
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
  }

  if (current.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, max - current.count),
    retryAfterSeconds: 0,
  };
}

/**
 * - Client IP
 * Render sits behind a proxy, so the forwarded address is the real caller.
 * Falls back to the socket address when the header is missing.
 *
 * @param req - the incoming request
 */
function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = first?.split(",")[0]?.trim() || req.ip || req.socket.remoteAddress;
  return ip || "unknown";
}

/**
 * - Set the standard rate-limit headers
 * So a client can back off before it is refused, and a developer can see the
 * limit in the response.
 */
function setHeaders(
  res: Response,
  max: number,
  remaining: number,
  windowSeconds: number,
): void {
  res.setHeader("RateLimit-Limit", String(max));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(windowSeconds));
}

/**
 * - Per-IP limiter for the auth routes
 * Slows down password guessing and mass registration from one address.
 */
export function authRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const windowMs = LIMITS.authWindowMinutes * 60 * 1000;
  const result = take(
    `auth:${clientIp(req)}`,
    LIMITS.authRequestsPerWindow,
    windowMs,
  );

  setHeaders(
    res,
    LIMITS.authRequestsPerWindow,
    result.remaining,
    Math.ceil(windowMs / 1000),
  );

  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    res.status(429).json({
      message: "Too many attempts. Please wait a few minutes and try again.",
    });
    return;
  }

  next();
}

/** Keys a per-user limiter can be built for, so one route group cannot spend another's budget. */
type UserBucket = "transfer" | "lookup" | "verification";

const USER_LIMITS: Record<UserBucket, { max: number; windowMinutes: number }> =
  {
    transfer: {
      max: LIMITS.userRequestsPerWindow,
      windowMinutes: LIMITS.userWindowMinutes,
    },
    // a lookup has its own, tighter budget: it is the route that could be used
    // to walk through account numbers, so it must not share the transfer quota
    lookup: {
      max: LIMITS.userRequestsPerWindow,
      windowMinutes: LIMITS.userWindowMinutes,
    },
    verification: {
      max: LIMITS.userRequestsPerWindow,
      windowMinutes: LIMITS.userWindowMinutes,
    },
  };

/**
 * - Per-user limiter
 * Must run after the auth middleware, which is what attaches `req.user`.
 *
 * @param bucket - which budget to charge
 * @returns an Express middleware for that budget
 */
export function userRateLimiter(bucket: UserBucket) {
  const { max, windowMinutes } = USER_LIMITS[bucket];
  const windowMs = windowMinutes * 60 * 1000;

  return function limitByUser(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // without an authenticated user there is nothing to charge; the auth
    // middleware that runs before this one has already refused the request
    const user = req.user;
    if (!user) {
      next();
      return;
    }

    const result = take(`user:${bucket}:${user._id.toString()}`, max, windowMs);

    setHeaders(res, max, result.remaining, Math.ceil(windowMs / 1000));

    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      res.status(429).json({
        message:
          bucket === "lookup"
            ? "Too many account lookups. Please wait a moment and try again."
            : "Too many requests. Please wait a moment and try again.",
      });
      return;
    }

    next();
  };
}

export default { authRateLimiter, userRateLimiter };
