#!/usr/bin/env node
// Measures response time of the public routes that sit on top of TMDb, so the
// effect of the Redis cache can be compared before and after.
//
//   node scripts/benchmark-tmdb-cache.cjs <label> [baseUrl] [rounds]
//
// Writes docs/perf/<label>.json and prints a summary. Only anonymous GET
// requests are sent; nothing here needs credentials.
//
// Node's fetch ignores ALL_PROXY and cannot speak SOCKS. When ALL_PROXY (or
// HTTPS_PROXY) is set, requests go through curl instead, which can. Compare
// runs made the same way: a proxy adds its own latency.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const proxy = process.env.ALL_PROXY || process.env.HTTPS_PROXY || '';

const label = process.argv[2];
const baseUrl = (process.argv[3] || 'http://localhost:3000').replace(/\/$/, '');
const rounds = Number(process.argv[4] || 12);
if (!label) {
  console.error(
    'usage: node scripts/benchmark-tmdb-cache.cjs <label> [baseUrl] [rounds]',
  );
  process.exit(1);
}

const DISTINCT_QUERIES = [
  'inception',
  'alien',
  'matrix',
  'godfather',
  'amelie',
  'parasite',
  'whiplash',
  'memento',
  'se7en',
  'gladiator',
  'heat',
  'drive',
];

// "repeat" scenarios ask for the same thing every round: this is what a cache
// speeds up. "distinct" asks for something new each round: the cache cannot
// help the first time, which shows the cost of a miss.
const scenarios = [
  {
    name: 'movie-details (550)',
    kind: 'repeat',
    url: () => '/movies/tmdb/550',
  },
  { name: 'genres', kind: 'repeat', url: () => '/movies/tmdb/genres' },
  {
    name: 'search "batman"',
    kind: 'repeat',
    url: () => '/movies/tmdb/search?query=batman',
  },
  { name: 'person (287)', kind: 'repeat', url: () => '/people/287' },
  {
    name: 'search (12 distinct queries)',
    kind: 'distinct',
    url: (i) =>
      '/movies/tmdb/search?query=' +
      DISTINCT_QUERIES[i % DISTINCT_QUERIES.length],
  },
];

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

function curlOne(url) {
  return new Promise((resolve) => {
    execFile(
      'curl',
      [
        '-s',
        '-m',
        '90',
        '--proxy',
        proxy,
        '-w',
        '\n%{http_code} %{time_total}',
        baseUrl + url,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => {
        const cut = stdout.lastIndexOf('\n');
        const [code, seconds] = stdout.slice(cut + 1).split(' ');
        if (error || !code || code === '000')
          return resolve({
            ms: null,
            status: 'curl-' + (error ? error.code : 'empty'),
            bytes: 0,
          });
        resolve({
          ms: Math.round(Number(seconds) * 1000),
          status: Number(code),
          bytes: cut,
        });
      },
    );
  });
}

async function timeOne(url) {
  if (proxy) return curlOne(url);
  const started = performance.now();
  const res = await fetch(baseUrl + url, {
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.arrayBuffer();
  return {
    ms: Math.round(performance.now() - started),
    status: res.status,
    bytes: body.byteLength,
  };
}

(async () => {
  // Render's free tier sleeps; the first request can take a minute. Wake it up
  // and keep that time out of the numbers.
  const wake = await timeOne('/').catch((e) => ({
    ms: -1,
    status: String(e.name),
  }));
  console.log(`warm-up: ${wake.status} in ${wake.ms}ms (not counted)`);

  const results = [];
  for (const scenario of scenarios) {
    const samples = [];
    for (let i = 0; i < rounds; i++) {
      try {
        samples.push(await timeOne(scenario.url(i)));
      } catch (e) {
        samples.push({ ms: null, status: String(e.name), bytes: 0 });
      }
    }
    const ok = samples
      .filter((s) => s.status === 200)
      .map((s) => s.ms)
      .sort((a, b) => a - b);
    const summary = ok.length
      ? {
          min: ok[0],
          median: percentile(ok, 50),
          p95: percentile(ok, 95),
          max: ok[ok.length - 1],
          mean: Math.round(ok.reduce((a, b) => a + b, 0) / ok.length),
        }
      : null;
    results.push({
      name: scenario.name,
      kind: scenario.kind,
      okCount: ok.length,
      failures: samples.filter((s) => s.status !== 200).map((s) => s.status),
      summary,
      msPerRequest: samples.map((s) => s.ms),
    });
    const s = summary;
    console.log(
      `${scenario.name.padEnd(32)} ` +
        (s
          ? `first ${String(samples[0].ms).padStart(5)}ms  median ${String(s.median).padStart(5)}ms  p95 ${String(s.p95).padStart(5)}ms  max ${String(s.max).padStart(5)}ms  (${ok.length}/${rounds} ok)`
          : 'no successful requests'),
    );
  }

  const out = {
    label,
    target: new URL(baseUrl).host,
    viaProxy: Boolean(proxy),
    measuredAt: new Date().toISOString(),
    rounds,
    results,
  };
  const dir = path.join(__dirname, '..', 'docs', 'perf');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`saved docs/perf/${label}.json`);
})();
