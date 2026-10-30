// Vercel Serverless Function -> POST /api/teach
// Adds a piece of knowledge to your ElevenLabs agent, privately.
//
// Required Vercel Environment Variables:
// ELEVENLABS_API_KEY - your ElevenLabs API key (server-side only, NEVER in the website)
// ADMIN_SECRET - a password you choose, so only you can use the teach page
// Optional:
// ELEVENLABS_AGENT_ID - defaults to your current agent id below

export default async function handler(req, res) {
if (req.method !== 'POST') {
return res.status(405).json({ error: 'Method not allowed' });
}

const API_KEY = process.env.ELEVENLABS_API_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID || 'agent_3801m61kzra2f1ps3gzgtr9b448d';

if (!API_KEY || !ADMIN_SECRET) {
return res.status(500).json({ error: 'Server not set up. Add ELEVENLABS_API_KEY and ADMIN_SECRET in Vercel.' });
}

let body = req.body;
if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
const { secret, text, name } = body || {};

if (secret !== ADMIN_SECRET) {
return res.status(401).json({ error: 'Wrong password.' });
}

// List existing topics (knowledge base documents attached to the agent)
if (body && (body.action === 'list' || body.list === true)) {
const headers = { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' };
try {
const agentRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, { headers });
const agent = await agentRes.json();
if (!agentRes.ok) {
return res.status(agentRes.status).json({ error: 'Could not read the agent', detail: agent });
}
const prompt = (((agent.conversation_config || {}).agent || {}).prompt) || {};
const kb = Array.isArray(prompt.knowledge_base) ? prompt.knowledge_base : [];
const topics = kb.map(x => ({ name: x && x.name, id: x && x.id })).filter(x => x.name);
return res.status(200).json({ ok: true, topics });
} catch (e) {
return res.status(500).json({ error: 'Something went wrong talking to ElevenLabs', detail: String(e) });
}
}

if (!text || !String(text).trim()) {
return res.status(400).json({ error: 'Nothing to teach - the text was empty.' });
}

const headers = { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' };
const docName = (name && name.trim()) || ('Lesson ' + new Date().toISOString().slice(0, 16).replace('T', ' '));

try {
// 1) Create a knowledge-base document from the text
const createRes = await fetch('https://api.elevenlabs.io/v1/convai/knowledge-base/text', {
method: 'POST', headers,
body: JSON.stringify({ text: String(text).trim(), name: docName })
});
const created = await createRes.json();
if (!createRes.ok) {
return res.status(createRes.status).json({ error: 'ElevenLabs rejected the text', detail: created });
}

// 2) Read the agent so we keep everything it already knows
const agentRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, { headers });
const agent = await agentRes.json();
if (!agentRes.ok) {
return res.status(agentRes.status).json({ error: 'Could not read the agent', detail: agent, savedButNotAttached: created.id });
}

const prompt = (((agent.conversation_config || {}).agent || {}).prompt) || {};
const kb = Array.isArray(prompt.knowledge_base) ? prompt.knowledge_base : [];
kb.push({ type: 'text', name: created.name || docName, id: created.id });
prompt.knowledge_base = kb;

// 3) Attach the new document to the agent
const patchRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
method: 'PATCH', headers,
body: JSON.stringify({ conversation_config: { agent: { prompt } } })
});
const patched = await patchRes.json();
if (!patchRes.ok) {
return res.status(patchRes.status).json({ error: 'Saved the note but could not attach it to the agent', detail: patched, savedButNotAttached: created.id });
}

return res.status(200).json({ ok: true, name: created.name || docName, id: created.id });
} catch (e) {
return res.status(500).json({ error: 'Something went wrong talking to ElevenLabs', detail: String(e) });
}
}
