// Ratchet: measured numbers may only go down.
// Usage:
//   node ratchet.mjs init  --result perf/bench/optimized.json --ceilings perf/bench/ceilings.json
//   node ratchet.mjs check --result perf/bench/now.json --ceilings perf/bench/ceilings.json [--update]
import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const action = args[0];
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const resultPath = getArg('--result');
const ceilingsPath = getArg('--ceilings', 'perf/bench/ceilings.json');
const update = args.includes('--update');

if (!['init', 'check'].includes(action) || !resultPath) {
  console.error('usage: ratchet.mjs init|check --result <bench.json> [--ceilings <json>] [--update]');
  process.exit(2);
}

const result = JSON.parse(await readFile(resultPath, 'utf8'));
const metrics = {
  ready_p75: { value: result.ready_p75, tolerance: 0.05, label: '打开到能用 p75 (ms)' },
  requests_p75: { value: result.requests_p75, tolerance: 0, label: '关键路径请求数 p75' },
  bytes_p75: { value: result.bytes_p75, tolerance: 0, label: '关键路径传输字节 p75' },
};

let ceilings = {};
try {
  ceilings = JSON.parse(await readFile(ceilingsPath, 'utf8'));
} catch {}

let failed = false;
for (const [key, m] of Object.entries(metrics)) {
  const ceiling = ceilings[key];
  if (action === 'init') {
    ceilings[key] = { label: m.label, ceiling: m.value, tolerance: m.tolerance };
    console.log(`init ${key} = ${m.value}`);
    continue;
  }
  if (ceiling === undefined) {
    console.log(`warn ${key}: no ceiling recorded yet`);
    continue;
  }
  const limit = ceiling.ceiling * (1 + ceiling.tolerance);
  if (m.value > limit) {
    console.log(`FAIL ${key}: ${m.value} > ceiling ${ceiling.ceiling} (+${(ceiling.tolerance * 100).toFixed(0)}%)`);
    failed = true;
  } else if (update && m.value < ceiling.ceiling) {
    const previous = ceiling.ceiling;
    ceilings[key].ceiling = m.value;
    console.log(`ratchet down ${key}: ${m.value} (was ${previous})`);
  } else {
    console.log(`ok ${key}: ${m.value} <= ${ceiling.ceiling}`);
  }
}

if (action === 'init' || (update && !failed)) {
  await writeFile(ceilingsPath, JSON.stringify(ceilings, null, 2) + '\n');
}
process.exit(failed ? 1 : 0);
