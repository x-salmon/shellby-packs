// PR check: validates every pack with Shellby's own validator plus registry rules,
// and every community news item (news/*.json) with the feed's rules.
//   node scripts/validate.mjs [--base origin/main]
// Writes a Markdown report to $GITHUB_STEP_SUMMARY when running in Actions.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadPacks, ROOT } from './registry.mjs';
import { loadNews } from './news.mjs';

const baseRef = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : null;
const { packs, problems: packProblems } = loadPacks({ baseRef });
const { feed: news, problems: newsProblems } = loadNews({ packs });
const problems = [...packProblems.map(p => ({ where: p.pack, message: p.message })), ...newsProblems.map(p => ({ where: `news/${p.item}`, message: p.message }))];

const lines = ['## 🦀 Shellby pack check', ''];
if (problems.length) {
  lines.push(`**${problems.length} problem${problems.length > 1 ? 's' : ''} found.** Fix these and push again:`, '');
  for (const p of problems) lines.push(`- \`${p.where}\`: ${p.message}`);
} else {
  lines.push(`All ${packs.length} pack${packs.length === 1 ? '' : 's'} passed. Preview any pack in [Pack Studio](https://x-salmon.github.io/shellby-packs/studio/).`);
}
const names = list => list.map(i => i.name).join(', ') || '-';
lines.push('', '| Pack | Version | Accessories | Effects | Colors | Voices | Scenes | Decor |', '|---|---|---|---|---|---|---|---|');
for (const p of packs) lines.push(`| **${p.pack.name}** (\`${p.id}\`) by ${p.pack.author}${p.contest ? ` · contest ${p.contest}` : ''} | ${p.pack.version} | ${['accessories', 'effects', 'skins', 'voices', 'scenes', 'decor'].map(f => names(p.pack[f])).join(' | ')} |`);
if (news.items.length) {
  lines.push('', '| News | Kind | Shown | Title |', '|---|---|---|---|');
  for (const i of news.items) lines.push(`| \`${i.id}\` | ${i.kind} | ${i.from} to ${i.until} | ${i.title.replace(/\|/g, '\\|')} |`);
}

// Anything outside packs/ (scripts, site, workflows) needs a maintainer's eyes.
if (baseRef) {
  let changed = [];
  try { changed = execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); } catch { /* shallow clone */ }
  const outside = changed.filter(f => !f.startsWith('packs/'));
  if (outside.length) lines.push('', `> ⚠️ **Maintainers:** this PR also changes files outside \`packs/\`: ${outside.map(f => `\`${f}\``).join(', ')}. Review those carefully before merging.`);
}

const report = lines.join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
process.exit(problems.length ? 1 : 0);
