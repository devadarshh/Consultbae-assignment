/**
 * A tiny OpenAI-compatible mock used to verify the n8n skill-categorization
 * workflow end-to-end without consuming Gemini quota (free tier is throttled).
 *
 * Mimics POST {baseUrl}/chat/completions → a {"candidates": [...]} JSON body.
 *
 * Run: npx tsx scripts/mock-llm.ts  (listens on :9999)
 * Point the workflow at it with LLM_URL=http://localhost:9999/v1beta/openai.
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 9999);

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.includes('/chat/completions')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad json' }));
      return;
    }

    const userMsg = parsed.messages?.find((m: any) => m.role === 'user')?.content ?? '';
    const match = userMsg.match(/Classify these candidates: (\[.*\])/);
    let candidates: Array<{ id: number; name: string; skills: string[] }> = [];
    if (match) {
      try {
        candidates = JSON.parse(match[1]);
      } catch {
        /* fall through to empty */
      }
    }

    const now = Date.now();
    const output = {
      candidates: candidates.map((c, i) => ({
        id: c.id,
        category: ['engineering', 'data', 'design', 'operations', 'sales', 'support', 'management', 'other'][i % 8],
        confidence: 0.5 + ((i * 7) % 45) / 100,
        reason: `Mock classification for candidate ${c.id} (${c.name}).`,
      })),
    };

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `mock-${now}`,
        object: 'chat.completion',
        model: parsed.model ?? 'mock',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(output) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }),
    );
  });
});

server.listen(PORT, () => console.log(`mock LLM listening on http://localhost:${PORT}/v1beta/openai/chat/completions`));