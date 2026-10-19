// Who added each pack version: the GitHub login of the author of the merged PR
// behind the last commit that changed packs/<id>/pack.json. It goes into
// index.json as `by`, which Shellby's credits and the Contestant trophy trust
// (a pack's `author` is free text). The Pages build has a GITHUB_TOKEN; without
// one (a local build), or when the commit came from no PR, `by` is left out.
import { ROOT, git } from './registry.mjs';

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/; // no bots ("name[bot]")
const API = 'https://api.github.com';

/**
 * Returns Map(pack id -> login) for the packs whose author it could find.
 * Never throws: a failed lookup only leaves that pack without `by`.
 */
export async function packAuthors(packs, {
  root = ROOT,
  token = process.env.GITHUB_TOKEN,
  repo = process.env.GITHUB_REPOSITORY || 'x-salmon/shellby-packs',
  branch = 'main',
  fetchImpl = globalThis.fetch,
  log = msg => console.warn(msg),
} = {}) {
  const out = new Map();
  if (!token || !packs.length) return out;
  const prsOf = new Map(); // commit -> its merged PR's author (packs changed together share one)
  for (const p of packs) {
    const sha = git(root, ['log', '-1', '--format=%H', '--', `packs/${p.dir}/pack.json`])?.trim();
    if (!sha) continue;
    if (!prsOf.has(sha)) prsOf.set(sha, await mergedPrAuthor(sha, { token, repo, branch, fetchImpl, log }));
    const login = prsOf.get(sha);
    if (login) out.set(p.id, login);
  }
  return out;
}

async function mergedPrAuthor(sha, { token, repo, branch, fetchImpl, log }) {
  try {
    const res = await fetchImpl(`${API}/repos/${repo}/commits/${sha}/pulls?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'shellby-packs-build' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { log(`by: no PR lookup for ${sha.slice(0, 7)} (HTTP ${res.status})`); return null; }
    const prs = await res.json();
    if (!Array.isArray(prs)) return null;
    // A commit can belong to several PRs (a fork's branch, a revert): the one merged into main, earliest first.
    const merged = prs.filter(pr => pr && pr.merged_at && pr.base?.ref === branch).sort((a, b) => a.merged_at.localeCompare(b.merged_at))[0];
    const login = merged?.user?.login;
    return typeof login === 'string' && LOGIN_RE.test(login) ? login : null;
  } catch (err) {
    log(`by: no PR lookup for ${sha.slice(0, 7)} (${err.message})`);
    return null;
  }
}
