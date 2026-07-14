const db = require("../db/db-connection");

// Simple in-memory cache — avoids a DB hit on every spin/register/referral
// Cache refreshes every 5 minutes or when admin updates a value
let cache = {};
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getConfig = async () => {
  const now = Date.now();
  if (Object.keys(cache).length && now - cacheTimestamp < CACHE_TTL) {
    return cache;
  }

  const rows = await db.app_config.findAll();
  cache = {};
  for (const row of rows) {
    cache[row.key] = row.value;
  }
  cacheTimestamp = now;
  return cache;
};

// Call this after admin updates a config value
const invalidateCache = () => {
  cache = {};
  cacheTimestamp = 0;
};

// Typed getters
const getInt = async (key, fallback = 0) => {
  const cfg = await getConfig();
  return parseInt(cfg[key] ?? fallback, 10);
};

module.exports = { getConfig, invalidateCache, getInt };