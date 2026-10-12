// Repository processing: fetch tree, filter, rank, and extract context for the model.
const IGNORE = /(^|\/)(node_modules|dist|build|vendor|\.git|\.next|coverage|__pycache__|target|out)(\/|$)|\.(png|jpe?g|gif|svg|ico|webp|pdf|zip|gz|lock|min\.js|map|woff2?|ttf|mp4|mp3)$|(package-lock\.json|yarn\.lock|bun\.lock|pnpm-lock\.yaml)$/i;
const CODE_EXT = /\.(ts|tsx|js|jsx|py|go|rs|java|kt|rb|php|c|cc|cpp|h|hpp|cs|swift|scala|vue|svelte|sh|md|toml|yaml|yml|json)$/i;
const KEY_FILES = /^(readme\.md|package\.json|pyproject\.toml|requirements\.txt|cargo\.toml|go\.mod|pom\.xml|dockerfile|contributing\.md|setup\.py)$/i;

export function parseRepoUrl(url: string) {
  const m = url.trim().match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/i) ?? url.trim().match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) throw new Error("Please enter a valid GitHub URL, e.g. https://github.com/owner/repo");
  return { owner: m[1], repo: m[2] };
}

function score(path: string) {
  const name = path.split("/").pop()!.toLowerCase();
  const depth = path.split("/").length;
  let s = 0;
  if (KEY_FILES.test(name)) s += 100;
  if (/^(main|index|app|server|cli|__init__|lib|mod)\./.test(name)) s += 40;
  if (/(^|\/)(src|app|lib|cmd|pkg)\//.test(path)) s += 15;
  if (/test|spec|example|docs?\//i.test(path)) s -= 20;
  return s - depth * 5;
}

export async function loadRepo(url: string) {
  const { owner, repo } = parseRepoUrl(url);
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "repo-explainer" };
  const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (metaRes.status === 404) throw new Error("Repository not found or private.");
  if (metaRes.status === 403) throw new Error("GitHub rate limit reached. Try again in a few minutes.");
  if (!metaRes.ok) throw new Error(`GitHub error ${metaRes.status}`);
  const meta = (await metaRes.json()) as { default_branch: string; description: string | null; stargazers_count: number };
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${meta.default_branch}?recursive=1`, { headers });
  if (!treeRes.ok) throw new Error(`Could not read repository tree (${treeRes.status}).`);
  const tree = (await treeRes.json()) as { tree: { path: string; type: string; size?: number }[] };
  const files = tree.tree.filter((f) => f.type === "blob" && !IGNORE.test(f.path));
  const langs: Record<string, number> = {};
  for (const f of files) { const e = f.path.split(".").pop()!.toLowerCase(); if (e.length < 6) langs[e] = (langs[e] ?? 0) + 1; }
  const picked = files
    .filter((f) => CODE_EXT.test(f.path) && (f.size ?? 0) < 60_000)
    .sort((a, b) => score(b.path) - score(a.path))
    .slice(0, 14);
  const contents = await Promise.all(
    picked.map(async (f) => {
      const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${meta.default_branch}/${f.path}`);
      const t = r.ok ? await r.text() : "";
      return { path: f.path, text: t.slice(0, 6000) };
    }),
  );
  return {
    owner, repo, branch: meta.default_branch, description: meta.description, stars: meta.stargazers_count,
    totalFiles: files.length,
    languages: Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} (${v})`),
    tree: files.slice(0, 300).map((f) => f.path),
    files: contents.filter((c) => c.text),
  };
}
