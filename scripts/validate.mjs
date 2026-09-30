// PR check: validates every pack with Shellby's own validator plus registry rules.
//   node scripts/validate.mjs [--base origin/main]
// Writes a Markdown report to $GITHUB_STEP_SUMMARY when running in Actions.
import fs from 'node:fs';
import { loadPacks } from './registry.mjs';

const baseRef = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : null;
const { packs, problems } = loadPacks({ baseRef });

const lines = ['## 🦀 Shellby pack check', ''];
if (problems.length) {
  lines.push(`**${problems.length} problem${problems.length > 1 ? 's' : ''} found.** Fix these and push again:`, '');
  for (const p of problems) lines.push(`- \`${p.pack}\`: ${p.message}`);
} else {
  lines.push(`All ${packs.length} pack${packs.length === 1 ? '' : 's'} passed. Preview any pack in [Pack Studio](https://x-salmon.github.io/shellby-packs/studio/).`);
}
lines.push('', '| Pack | Version | Accessories | Effects | Colors |', '|---|---|---|---|---|');
for (const p of packs) lines.push(`| **${p.pack.name}** (\`${p.id}\`) by ${p.pack.author} | ${p.pack.version} | ${p.pack.accessories.map(a => a.name).join(', ') || '-'} | ${p.pack.effects.map(e => e.name).join(', ') || '-'} | ${p.pack.skins.map(s => s.name).join(', ') || '-'} |`);

const report = lines.join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
process.exit(problems.length ? 1 : 0);
