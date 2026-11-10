// Breakout Live Mods local server. Node built-ins only.
// Serves only the files Breakout needs. The OpenRouter key stays in the server env.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateModResponse } from './rules.mjs';

const dir = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = '127.0.0.1';
const MAX_BODY = 4096;
const MAX_PROMPT = 500;
const UPSTREAM_TIMEOUT_MS = 20000;
let cumulativeCost = null;

const FILES = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/game.js': 'game.js',
    '/gameObjects.js': 'gameObjects.js',
    '/ui.js': 'ui.js',
    '/rules.mjs': 'rules.mjs',
    '/style.css': 'style.css',
    '/tiles.png': 'tiles.png',
    '/littlejs.esm.js': '../../dist/littlejs.esm.js',
    '/dist/littlejs.esm.js': '../../dist/littlejs.esm.js',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
    res.end(body);
}

function reportedCost(usage) {
    const cost = usage?.cost;
    return typeof cost === 'number' && Number.isFinite(cost) ? cost : null;
}
function addCost(cost) {
    if (cost === null) return cumulativeCost;
    cumulativeCost = (cumulativeCost ?? 0) + cost;
    return cumulativeCost;
}

const SYSTEM_PROMPT = [
    'You convert a Breakout request into one compact JSON object only. No other text.',
    'Supported gameplay rules only. Triggers: purple_brick, any_brick, every_n_bricks (n integer 2-20). Effects: split_ball, widen_paddle, slow_ball.',
    'For a gameplay rule return {"kind":"rule","trigger":"<trigger>","effect":"<effect>","n":<number or null>}. Set n only for every_n_bricks, otherwise null.',
    'For a request to draw a jester face or peppermint ball on the ball, reskin the ball, or draw a face on the ball, return {"kind":"sprite","sprite":[8 strings],"label":"<short label>"}. Each sprite string is exactly 8 characters using only . P W G R O B (dot is transparent). Purple=P, white=W, green=G, red=R, orange=O, black=B. Draw an original simple 8x8 design. Never return an empty sprite.',
    'For anything else return {"kind":"unsupported","supported":false,"message":"<short reason>"}.',
].join(' ');

async function handleMod(req, res) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().startsWith('application/json'))
        return sendJson(res, 415, { error: 'Content-Type must be application/json.' });
    const origin = req.headers.origin;
    if (origin) {
        let originUrl;
        try { originUrl = new URL(origin); } catch { return sendJson(res, 403, { error: 'Invalid Origin.' }); }
        if (originUrl.protocol !== 'http:' || originUrl.host !== req.headers.host)
            return sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' });
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) return sendJson(res, 413, { error: 'Request body too large.' });
        chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return sendJson(res, 400, { error: 'Request body must be valid JSON.' }); }
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return sendJson(res, 400, { error: 'Prompt must be a non-empty string.' });
    if (prompt.length > MAX_PROMPT) return sendJson(res, 400, { error: `Prompt must be at most ${MAX_PROMPT} characters.` });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey)
        return sendJson(res, 503, { error: 'Modding is unavailable: OPENROUTER_API_KEY is not configured on the server. The game is still playable.' });

    let upstream;
    let data;
    try {
        upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': `http://${HOST}:${PORT}/`,
                'X-Title': 'Breakout Live Mods',
            },
            body: JSON.stringify({
                model: 'meta/muse-ember',
                reasoning: { effort: 'low' },
                // The budget covers reasoning and the visible sprite grid.
                max_tokens: 1500,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                ],
            }),
        });
        data = await upstream.json();
    } catch (err) {
        const timedOut = err?.name === 'AbortError' || err?.name === 'TimeoutError';
        if (timedOut) return sendJson(res, 504, { error: 'Model request timed out.' });
        if (upstream) return sendJson(res, 502, { error: 'Model returned a non-JSON response.', cost: null, cumulativeCost });
        return sendJson(res, 502, { error: 'Model request failed.' });
    }

    const cost = reportedCost(data?.usage);
    addCost(cost);
    if (!upstream.ok)
        return sendJson(res, 502, { error: 'Model request failed.', cost, cumulativeCost });

    let content = data?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) content = content.map((p) => p?.text || '').join('');
    if (typeof content !== 'string' || !content.trim())
        return sendJson(res, 502, { error: 'Model returned an empty response.', cost, cumulativeCost });
    let parsed;
    try { parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch { return sendJson(res, 502, { error: 'Model returned invalid JSON.', cost, cumulativeCost }); }

    const validated = validateModResponse(parsed);
    if (!validated.ok)
        return sendJson(res, 502, { error: `Invalid model response: ${validated.error}`, cost, cumulativeCost });
    if (validated.kind === 'unsupported')
        return sendJson(res, 200, { kind: 'unsupported', supported: false, message: validated.message, cost, cumulativeCost });
    if (validated.kind === 'rule')
        return sendJson(res, 200, { kind: 'rule', rule: validated.rule, cost, cumulativeCost });
    return sendJson(res, 200, { kind: 'sprite', sprite: validated.sprite.sprite, label: validated.sprite.label, cost, cumulativeCost });
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${HOST}:${PORT}`);
        if (url.pathname === '/api/mod') {
            if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
            return await handleMod(req, res);
        }
        if (req.method !== 'GET' && req.method !== 'HEAD')
            return sendJson(res, 405, { error: 'Method not allowed.' });
        const file = Object.hasOwn(FILES, url.pathname) ? FILES[url.pathname] : undefined;
        if (!file) return sendJson(res, 404, { error: 'Not found.' });
        const target = normalize(join(dir, file));
        if (!target.startsWith(normalize(dir)) && !target.endsWith('dist/littlejs.esm.js'))
            return sendJson(res, 404, { error: 'Not found.' });
        const data = await readFile(target);
        res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream', 'Content-Length': data.length, 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
        if (!res.headersSent) sendJson(res, 500, { error: 'Server error.' });
        else res.end();
    }
});

if (process.argv[1] === fileURLToPath(import.meta.url))
    server.listen(PORT, HOST, () => console.log(`Breakout Live Mods on http://${HOST}:${PORT}/`));

export { server };
