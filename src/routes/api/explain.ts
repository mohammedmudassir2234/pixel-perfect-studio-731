import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { loadRepo } from "@/lib/github-loader.server";

const MODES: Record<string, string> = {
  architecture: "Explain the overall architecture: purpose, tech stack, main components, how data flows between them, and where a new contributor should start.",
  guide: "Produce a file-by-file guide of the most important files provided, one short bullet each describing its role.",
  debug: "Help diagnose the bug/error described by the user. Identify likely causes in the provided code, point to exact files, and suggest concrete fixes.",
  question: "Answer the user's question about this repository.",
};

export const Route = createFileRoute("/api/explain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { url?: string; mode?: string; question?: string };
        if (!body.url || typeof body.url !== "string") return Response.json({ error: "Repository URL is required." }, { status: 400 });
        const mode = MODES[body.mode ?? ""] ? body.mode! : "architecture";
        const question = String(body.question ?? "").slice(0, 2000);
        let repo;
        try { repo = await loadRepo(body.url); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }

        const context = [
          `Repository: ${repo.owner}/${repo.repo} (branch ${repo.branch}, ${repo.stars} stars)`,
          `Description: ${repo.description ?? "n/a"}`,
          `Languages: ${repo.languages.join(", ")}`,
          `File tree (${repo.totalFiles} files, truncated):\n${repo.tree.join("\n")}`,
          ...repo.files.map((f) => `=== FILE: ${f.path} ===\n${f.text}`),
        ].join("\n\n");

        const system = `You are an expert software engineer helping contributors understand open-source repositories.
Rules: base every claim on the provided files. Cite evidence inline as \`path/to/file\`. If something is not visible in the provided context, say so explicitly under a final "## Uncertainty" section. Never invent files. Use concise Markdown with headings.`;

        const openai = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: process.env.LOVABLE_API_KEY,
          headers: { "Lovable-API-Key": process.env.LOVABLE_API_KEY ?? "", "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        });
        const result = streamText({
          model: openai.responses("openai/gpt-6-astra"),
          system,
          prompt: `${context}\n\nTASK: ${MODES[mode]}${question ? `\nUser input: ${question}` : ""}`,
          abortSignal: request.signal,
          providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
        });
        const meta = JSON.stringify({ repo: `${repo.owner}/${repo.repo}`, languages: repo.languages, analyzed: repo.files.map((f) => f.path), totalFiles: repo.totalFiles });
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(c) {
            c.enqueue(enc.encode(meta + "\n"));
            try {
              for await (const part of result.fullStream) {
                if (part.type === "text-delta") c.enqueue(enc.encode(part.text));
                if (part.type === "error") c.enqueue(enc.encode(`\n\n**AI error:** ${String((part.error as Error)?.message ?? part.error)}`));
              }
            } catch (e) { c.enqueue(enc.encode(`\n\n**AI error:** ${(e as Error).message}`)); }
            c.close();
          },
        });
        return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      },
    },
  },
});
