#!/usr/bin/env node
// gc4 — the OSS gc4.ai CLI (Epic 12, Phase B). A thin Node wrapper over the
// generated OSS TypeScript client (../typescript-sdk/generated). Non-stream
// (typed SSE is a Speakeasy-tier property; the CLI gains streaming when it
// migrates onto the premium @gc4ai/sdk — architecture OQ-4 / D10).
//
// This file is COPIED verbatim by apps/web/openapi/generate/generate.sh
// (target `cli`); it imports the generated GC4 client at runtime so there is
// no second source of the request logic.
//
// Usage:
//   GC4_API_KEY=<key> gc4 models
//   GC4_API_KEY=<key> gc4 chat "hello" --model openai/gpt-4o-mini
//   GC4_API_KEY=<key> gc4 complete "Once upon a time" --model meta/llama-3.3-70b
//
// Env:
//   GC4_API_KEY   required — your gc4.ai API key
//   GC4_BASE_URL  optional — defaults to https://gc4.ai
//
// Runtime note: the generated OSS client ships as TypeScript (../typescript-sdk/
// generated/index.ts). Run this CLI under a TS-aware runtime (`tsx gc4.mjs ...`)
// or point GC4_CLIENT at a built JS entry. The import is LAZY (loaded only when a
// command needs the network), so `gc4 help` and the syntax smoke never touch it.

// gc4-sdks/cli/src/gc4.mjs -> ../../../typescript-sdk/generated/index.ts
// (cli is under gc4-sdks/, typescript-sdk is its sibling).
const DEFAULT_CLIENT = new URL(
  "../../../typescript-sdk/generated/index.ts",
  import.meta.url,
).href;

async function loadClient() {
  const mod = await import(process.env.GC4_CLIENT ?? DEFAULT_CLIENT);
  return mod;
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      flags[key] = val;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function client() {
  const apiKey = process.env.GC4_API_KEY;
  if (!apiKey) {
    console.error("gc4: GC4_API_KEY is required");
    process.exit(2);
  }
  const { GC4 } = await loadClient();
  return new GC4({ apiKey, baseUrl: process.env.GC4_BASE_URL });
}

const HELP = `gc4 — gc4.ai CLI (OSS, non-stream)

Commands:
  gc4 models                              list available models
  gc4 chat <prompt> --model <id>          one-shot chat completion
  gc4 complete <prompt> --model <id>      text completion

Env: GC4_API_KEY (required), GC4_BASE_URL (default https://gc4.ai)`;

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];

  if (!cmd || cmd === "help" || flags.help) {
    console.log(HELP);
    return;
  }

  try {
    const gc4 = await client();
    switch (cmd) {
      case "models": {
        const res = await gc4.models.list();
        for (const m of res.data ?? []) console.log(m.id);
        break;
      }
      case "chat": {
        const prompt = positional[1];
        const model = flags.model;
        if (!prompt || !model) {
          console.error("gc4 chat <prompt> --model <id>");
          process.exit(2);
        }
        const res = await gc4.chat.send({
          model,
          messages: [{ role: "user", content: prompt }],
        });
        process.stdout.write((res.choices?.[0]?.message?.content ?? "") + "\n");
        break;
      }
      case "complete": {
        const prompt = positional[1];
        const model = flags.model;
        if (!prompt || !model) {
          console.error("gc4 complete <prompt> --model <id>");
          process.exit(2);
        }
        const res = await gc4.completions.create({ model, prompt });
        process.stdout.write((res.choices?.[0]?.text ?? "") + "\n");
        break;
      }
      default:
        console.error(`gc4: unknown command '${cmd}'\n\n${HELP}`);
        process.exit(2);
    }
  } catch (e) {
    // Duck-type the typed API error (GC4ApiError) without a static import —
    // the client module is loaded lazily, so we key on its shape.
    if (e && e.name === "GC4ApiError") {
      console.error(`gc4: API error ${e.status}:`, JSON.stringify(e.body));
      process.exit(1);
    }
    console.error("gc4:", e?.message ?? e);
    process.exit(1);
  }
}

main();
