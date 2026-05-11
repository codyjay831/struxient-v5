import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

let redis: Redis | null = null;

if (REDIS_URL) {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
  });
  
  redis.on("error", (err) => {
    console.error("Redis error:", err);
  });
}

// Fallback in-memory map for development
const inMemoryStore = new Map<string, { count: number; windowStart: number }>();

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
};

/**
 * Simple rate limiter that works with Redis (if available) or in-memory.
 */
export async function checkRateLimit(
  identifier: string,
  options: RateLimitOptions
): Promise<boolean> {
  const { windowMs, max, keyPrefix } = options;
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();

  if (redis) {
    try {
      const current = await redis.get(key);
      if (current === null) {
        await redis.set(key, "1", "PX", windowMs);
        return true;
      }

      const count = parseInt(current, 10);
      if (count >= max) {
        return false;
      }

      await redis.incr(key);
      return true;
    } catch (err) {
      console.error("Rate limit check failed, falling back to allow:", err);
      return true; // Fail open if Redis is down
    }
  }

  // In-memory fallback
  const record = inMemoryStore.get(key);
  if (!record || now - record.windowStart > windowMs) {
    inMemoryStore.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (record.count >= max) {
    return false;
  }

  record.count += 1;
  return true;
}
