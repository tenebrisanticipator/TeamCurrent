const cache = new Map();

function getCache(key) { 
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { 
    cache.delete(key); 
    return null; 
  }
  return entry.data;
}

function setCache(key, data, ttlMs = 60000) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function deleteCache(key) {
  cache.delete(key);
}

function clearCacheWithPrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

module.exports = { getCache, setCache, deleteCache, clearCacheWithPrefix };
