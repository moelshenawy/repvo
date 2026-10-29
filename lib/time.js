// Time-zone helpers built on Intl (no libraries).

function parts(ts, tz) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" })
    .formatToParts(new Date(ts)).forEach(x => (p[x.type] = x.value));
  return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(p.weekday) };
}
function tzOffset(ts, tz) { const p = parts(ts, tz); return Date.UTC(p.y, p.m, p.d, p.h, p.mi, p.s) - Math.floor(ts / 1000) * 1000; }
/** Wall-clock time in a zone → UTC timestamp. */
function wallToUtc(y, m, d, h, mi, tz) { const g = Date.UTC(y, m, d, h, mi); const t = g - tzOffset(g, tz); return g - tzOffset(t, tz); }

function fmt(ts, tz, o) {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(new Date(ts)); }
  catch { return new Date(ts).toUTCString(); }
}
function validTz(tz) { if (typeof tz !== "string" || !tz) return false; try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }

/** Same day-of-month next month (clamped to month length), same time of day, UTC. */
function addMonth(ts, anchorDay) {
  const d = new Date(ts);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(anchorDay, last), d.getUTCHours(), d.getUTCMinutes());
}

const ordinal = n => { const s = ["th","st","nd","rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

module.exports = { parts, wallToUtc, fmt, validTz, addMonth, ordinal };
