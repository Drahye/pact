// Generates the narration for the demo with a local text-to-speech model (Kokoro, through `hyperframes tts`).
// Usage: node scripts/demo-voice.mjs [voice]   → exports/voice/*.wav and exports/voice/index.json
// Lines already generated are reused, so changing one caption only costs one line.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { extractLines, lineId, speechText } from './lib/demo-lines.mjs';

const run = promisify(execFile);
const voice = process.argv[2] ?? 'af_heart';
const dir = 'exports/voice';
mkdirSync(dir, { recursive: true });
const indexPath = `${dir}/index.json`;
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {};
const lines = extractLines(readFileSync(new URL('./demo-video.mjs', import.meta.url), 'utf8'));
const todo = lines.filter((l) => !index[lineId(l)] || index[lineId(l)].voice !== voice);
console.log(`${lines.length} lines, ${todo.length} to generate with ${voice}`);

// Two at a time: each run loads the model, and this machine is short on memory.
let next = 0;
const worker = async () => {
  while (next < todo.length) {
    const text = todo[next++];
    const id = lineId(text);
    const file = `${dir}/${id}.wav`;
    const { stdout } = await run('npx', ['--yes', 'hyperframes', 'tts', speechText(text), '-v', voice, '-o', file, '--json'], { maxBuffer: 10_000_000 });
    const r = JSON.parse(stdout.trim().split('\n').pop());
    index[id] = { text, voice, file, seconds: r.durationSeconds };
    writeFileSync(indexPath, JSON.stringify(index, null, 1));
    console.log(`✓ ${id} ${r.durationSeconds.toFixed(1)}s  ${text.slice(0, 60)}`);
  }
};
await Promise.all([worker(), worker()]);
console.log('done:', Object.keys(index).length, 'lines in', indexPath);
