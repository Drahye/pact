// Adds a soft music bed and the narration to a recorded demo.
// Usage: node scripts/demo-audio.mjs <demo.webm> <narration.json> <out.mp4> [trimSeconds=0.8]
// The music is synthesised here (no licensed tracks) and ducks under the voice.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const [video, narrationPath, out, trimArg] = process.argv.slice(2);
if (!video || !narrationPath || !out) throw new Error('Usage: node scripts/demo-audio.mjs <demo.webm> <narration.json> <out.mp4> [trim]');
const trim = Number(trimArg ?? 0.8);
const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const dir = mkdtempSync(`${tmpdir()}/pact-audio-`);
const total =
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString()) - trim;

/* ---- music: four chords, 8 seconds each, with a soft pluck on top, looped ---- */
const chords = [
  [130.81, 196.0, 246.94, 329.63], // Cmaj7
  [110.0, 164.81, 196.0, 261.63], // Am7
  [87.31, 130.81, 220.0, 329.63], // Fmaj7
  [98.0, 146.83, 246.94, 293.66], // G
];
const inputs = [];
const chains = [];
chords.forEach((notes, c) => {
  const at = c * 8000;
  notes.forEach((f, i) => {
    // pad: a slowly breathing sine, faded in and out so chords blend
    inputs.push(`aevalsrc='0.07*sin(2*PI*${f}*t)*(0.85+0.15*sin(2*PI*0.2*t))':d=9.5:s=44100`);
    chains.push(`[${inputs.length - 1}:a]afade=t=in:d=1.5,afade=t=out:st=8:d=1.5,adelay=${at}|${at}[p${c}${i}]`);
    // pluck: the same note an octave up, every two seconds, staggered into a gentle arpeggio
    inputs.push(`aevalsrc='0.07*sin(2*PI*${f * 2}*t)*exp(-3.5*mod(t,2))':d=8:s=44100`);
    const pat = at + i * 500;
    chains.push(`[${inputs.length - 1}:a]adelay=${pat}|${pat}[k${c}${i}]`);
  });
});
const labels = chains.map((_, i) => (i % 2 === 0 ? `[p${Math.floor(i / 2 / 4)}${(i / 2) % 4}]` : `[k${Math.floor((i - 1) / 2 / 4)}${((i - 1) / 2) % 4}]`));
const loopGraph = `${chains.join(';')};${labels.join('')}amix=inputs=${labels.length}:normalize=0,lowpass=f=2400,aecho=0.8:0.6:420|700:0.3|0.2,atrim=0:32,asetpts=N/SR/TB[m]`;
const loopFile = `${dir}/loop.wav`;
ff(...inputs.flatMap((i) => ['-f', 'lavfi', '-i', i]), '-filter_complex', loopGraph, '-map', '[m]', '-ac', '2', loopFile);

/* ---- voice: every line placed at the moment its caption appeared ---- */
const { lines } = JSON.parse(readFileSync(narrationPath, 'utf8'));
const voiceIns = lines.flatMap((l) => ['-i', l.file]);
const voiceChains = lines.map((l, i) => {
  const ms = Math.max(0, Math.round(l.ms - trim * 1000 + 250)); // a beat after the caption lands
  return `[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`;
});
const voiceMix = `${voiceChains.join(';')};${lines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${lines.length}:normalize=0,volume=1.6[voice]`;
const graph = [
  voiceMix,
  `[0:a]volume=0.55,afade=t=in:d=3,afade=t=out:st=${(total - 4).toFixed(2)}:d=4[bed]`,
  `[voice]asplit=2[vo][vsc]`,
  `[bed][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=40:release=500[ducked]`,
  `[ducked][vo]amix=inputs=2:normalize=0,alimiter=limit=0.89[a]`,
];

ff(
  '-stream_loop', '-1', '-i', loopFile,
  ...voiceIns,
  '-ss', String(trim), '-i', video,
  '-filter_complex', graph.join(';'),
  '-map', `${lines.length + 1}:v`, '-map', '[a]',
  '-t', total.toFixed(2),
  '-c:v', 'libx264', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
  out,
);
console.log('wrote', out);
