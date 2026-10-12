import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RepoLens — AI Repository Explainer" },
      { name: "description", content: "Paste a GitHub repo and get an AI-generated architecture explanation, file guide, and bug diagnosis with cited evidence." },
      { property: "og:title", content: "RepoLens — AI Repository Explainer" },
      { property: "og:description", content: "AI that reads real code and explains any public GitHub repository." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const MODES = [
  { id: "architecture", label: "Architecture" },
  { id: "guide", label: "File guide" },
  { id: "question", label: "Ask a question" },
  { id: "debug", label: "Diagnose a bug" },
];
const PIPELINE = ["Fetch repo", "Filter & rank files", "AI reasoning", "Cited answer"];

type Meta = { repo: string; languages: string[]; analyzed: string[]; totalFiles: number };

function Index() {
  const [url, setUrl] = useState("https://github.com/sindresorhus/is-online");
  const [mode, setMode] = useState("architecture");
  const [question, setQuestion] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  const [stage, setStage] = useState(-1);
  const ctrl = useRef<AbortController | null>(null);

  async function run() {
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    setOut(""); setErr(""); setMeta(null); setStage(0);
    try {
      const res = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, mode, question }), signal: c.signal });
      if (!res.ok || !res.body) { setErr((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`); setStage(-1); return; }
      const reader = res.body.getReader(); const dec = new TextDecoder();
      let buf = ""; let gotMeta = false; setStage(2);
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        if (!gotMeta) { const i = buf.indexOf("\n"); if (i < 0) continue; setMeta(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); gotMeta = true; }
        setOut(buf);
      }
      setStage(3);
    } catch (e) { if ((e as Error).name !== "AbortError") setErr((e as Error).message); setStage(-1); }
  }

  const busy = stage >= 0 && stage < 3;
  const needsInput = mode === "question" || mode === "debug";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">RepoLens</p>
        <h1 className="mt-3 font-display text-4xl md:text-6xl">Understand any repo,<br /><span className="text-primary">backed by its own code.</span></h1>
        <p className="mt-4 max-w-xl text-muted-foreground">Paste a public GitHub repository. RepoLens fetches the real files, picks the most relevant ones, and an AI model explains it — citing every file it relies on.</p>

        <section className="mt-10 rounded-xl border border-border bg-card p-5 shadow-glow">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" className="w-full rounded-md border border-input bg-background px-4 py-3 font-mono text-sm outline-none focus:border-primary" />
          <div className="mt-4 flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button key={m.id} onClick={() => setMode(m.id)} className={`rounded-full border px-4 py-1.5 text-sm transition ${mode === m.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{m.label}</button>
            ))}
          </div>
          {needsInput && (
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} placeholder={mode === "debug" ? "Paste the error message or describe the bug…" : "e.g. Where is authentication handled?"} className="mt-4 w-full rounded-md border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary" />
          )}
          <button disabled={busy || !url || (needsInput && !question)} onClick={run} className="mt-4 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40">{busy ? "Analyzing…" : "Explain repository"}</button>
        </section>

        <ol className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
          {PIPELINE.map((p, i) => (
            <li key={p} className={`rounded-md border px-3 py-2 font-mono text-xs ${i <= stage ? "border-primary text-primary" : "border-border text-muted-foreground"} ${i === 2 ? "font-bold" : ""}`}>{i + 1}. {p}{i === 2 ? " ★" : ""}</li>
          ))}
        </ol>

        {err && <p className="mt-6 rounded-md border border-destructive p-4 text-destructive">{err}</p>}

        {meta && (
          <div className="mt-8 grid gap-6 md:grid-cols-[240px_1fr]">
            <aside className="space-y-4 text-sm">
              <div><p className="font-mono text-xs uppercase text-muted-foreground">Repository</p><p className="font-mono">{meta.repo}</p></div>
              <div><p className="font-mono text-xs uppercase text-muted-foreground">Languages</p><p>{meta.languages.join(", ")}</p></div>
              <div><p className="font-mono text-xs uppercase text-muted-foreground">Evidence sent to AI ({meta.analyzed.length}/{meta.totalFiles})</p>
                <ul className="mt-1 space-y-1">{meta.analyzed.map((f) => <li key={f} className="truncate font-mono text-xs text-primary">{f}</li>)}</ul></div>
            </aside>
            <article className="prose-repo rounded-xl border border-border bg-card p-6">
              {out ? <ReactMarkdown>{out}</ReactMarkdown> : <p className="animate-pulse text-muted-foreground">AI is reading the code…</p>}
            </article>
          </div>
        )}
      </div>
    </main>
  );
}
