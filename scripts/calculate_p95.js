import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const logPath = path.resolve(__dirname, '../logs/combined.log');
  if (!fs.existsSync(logPath)) {
    console.error('combined.log not found');
    return;
  }

  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const endpoints = {};
  let totalEntries = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data.durationMs !== undefined && (data.path || data.method)) {
        totalEntries++;
        // Normalize path: replace ObjectIds and numbers
        let normPath = (data.path || '').split('?')[0];
        normPath = normPath.replace(/[0-9a-fA-F]{24}/g, ':id');
        normPath = normPath.replace(/\/\d+/g, '/:id');
        const key = `${data.method || 'GET'} ${normPath || '/'}`;

        if (!endpoints[key]) endpoints[key] = [];
        endpoints[key].push(data.durationMs);
      }
    } catch (e) {
      // ignore non-json lines
    }
  }

  console.log(`\n=== Log Dataset Analyzed: ${totalEntries} HTTP Requests ===\n`);

  const results = [];
  for (const [ep, durations] of Object.entries(endpoints)) {
    durations.sort((a, b) => a - b);
    const count = durations.length;
    const p50 = durations[Math.floor(count * 0.50)];
    const p90 = durations[Math.floor(count * 0.90)];
    const p95 = durations[Math.floor(count * 0.95)];
    const p99 = durations[Math.floor(count * 0.99)];
    const max = durations[count - 1];
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / count);

    results.push({
      Endpoint: ep,
      Calls: count,
      'Avg (ms)': avg,
      'p50 (ms)': p50,
      'p90 (ms)': p90,
      'p95 (ms)': p95,
      'p99 (ms)': p99,
      'Max (ms)': max
    });
  }

  results.sort((a, b) => b['p95 (ms)'] - a['p95 (ms)']);
  console.table(results);
}

main().catch(console.error);
