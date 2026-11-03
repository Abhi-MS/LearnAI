// Process-wide daily cap; resets at UTC midnight and on restart
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
