import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as Sentry from '@sentry/node';

// Load .env.local without extra dependencies (stdout is reserved for the MCP protocol)
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, '');
    }
  }
} catch {
  // env vars may come from the client config instead
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1.0),
});

async function main() {
  const { createInstrumentedServer } = await import('./server');
  await createInstrumentedServer().connect(new StdioServerTransport());
  console.error('LearnAI MCP server running on stdio');
}

main().catch(async (error) => {
  Sentry.captureException(error);
  await Sentry.flush(2000);
  console.error(error);
  process.exit(1);
});
