// Daily cap; resets at UTC midnight and on restart
export function createDailyLimiter(limit: number, now: () => Date = () => new Date()) {
  let day = now().toISOString().slice(0, 10);
  let count = 0;

  return function consume() {
    const today = now().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      count = 0;
    }
    if (count >= limit) return false;
    count += 1;
    return true;
  };
}

// Per-key variant so each user gets their own daily allowance
export function createKeyedDailyLimiter(limit: number, now: () => Date = () => new Date()) {
  const limiters = new Map<string, () => boolean>();
  let day = now().toISOString().slice(0, 10);

  return function consume(key: string) {
    const today = now().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      limiters.clear();
    }
    let limiter = limiters.get(key);
    if (!limiter) {
      limiter = createDailyLimiter(limit, now);
      limiters.set(key, limiter);
    }
    return limiter();
  };
}
