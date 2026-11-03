import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import { fetchCuratedTopicRows, groupTopicsByTrack } from '../lib/topics';

export const MAX_TOPICS_PER_CALL = 25;

// Process-wide daily cap so a connected AI client cannot loop on the tools forever
export function createDailyLimiter(limit: number, now: () => Date = () => new Date()) {
  let day = now().toISOString().slice(0, 10);
  let count = 0;

  return function consume() {
    const today = now().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      count = 0;
    }
    if (count >= limit) return false;
    count += 1;
    return true;
  };
}

const LIMIT_MESSAGE = 'Daily tool-call limit reached. Try again tomorrow.';

export function createLearnAiServer(
  consume: () => boolean = createDailyLimiter(Number(process.env.MCP_DAILY_CALL_LIMIT ?? 500)),
) {
  const server = new McpServer({ name: 'learnai', version: '0.1.0' });

  server.registerTool(
    'list_tracks',
    {
      title: 'List tracks',
      description: 'List the learning tracks (frontend, backend, devops) with topic counts.',
    },
    async () => {
      if (!consume()) return { isError: true, content: [{ type: 'text', text: LIMIT_MESSAGE }] };

      const tracks = groupTopicsByTrack(await fetchCuratedTopicRows());
      const summary = tracks.map((t) => ({ slug: t.slug, name: t.name, topicCount: t.topics.length }));
      return { content: [{ type: 'text', text: JSON.stringify(summary) }] };
    },
  );

  server.registerTool(
    'list_topics',
    {
      title: 'List topics',
      description: `List curated topics, optionally for one track. Returns at most ${MAX_TOPICS_PER_CALL} topics.`,
      inputSchema: {
        track: z.enum(['frontend', 'backend', 'devops']).optional().describe('Track slug to filter by'),
        limit: z.number().int().min(1).max(MAX_TOPICS_PER_CALL).default(10),
      },
    },
    async ({ track, limit }) => {
      if (!consume()) return { isError: true, content: [{ type: 'text', text: LIMIT_MESSAGE }] };

      const rows = (await fetchCuratedTopicRows(track)).slice(0, limit);
      return { content: [{ type: 'text', text: JSON.stringify(groupTopicsByTrack(rows)) }] };
    },
  );

  return server;
}

export function createInstrumentedServer() {
  return Sentry.wrapMcpServerWithSentry(createLearnAiServer());
}
