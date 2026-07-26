/**
 * POST /api/brief  — Vercel serverless function.
 *
 * Receives a project brief from /brief and files it as an issue in Linear
 * (COGNAK workspace). This keeps client lead-intake off email entirely — no
 * sending domain, no deliverability/spam, no forwarding to chase.
 *
 * Required env var (Vercel -> Project -> Settings -> Environment Variables):
 *   LINEAR_API_KEY    a Linear Personal API key from the COGNAK workspace
 *                     (Linear -> Settings -> Security & access -> Personal API keys).
 *                     Passed to Linear directly in the Authorization header.
 * Optional env vars:
 *   LINEAR_TEAM_KEY   which team to file into, by its key (the issue prefix,
 *                     e.g. "COG"). If unset and the workspace has exactly one
 *                     team, that team is used; if there are several, the function
 *                     replies with the list so you know what to set.
 *   LINEAR_LABEL      a label name to attach to each brief (e.g. "Brief"), if it
 *                     exists on the team.
 */

const LINEAR_API = 'https://api.linear.app/graphql';

async function linear(apiKey, query, variables) {
  const r = await fetch(LINEAR_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({ query, variables: variables || {} }),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json || json.errors) {
    const msg =
      json && json.errors ? json.errors.map((e) => e.message).join('; ') : 'HTTP ' + r.status;
    throw new Error(msg);
  }
  return json.data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Brief intake is not configured yet.' });
  }

  // Vercel parses JSON bodies automatically, but guard for a raw string too.
  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = null; }
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Bad request' });
  }

  const text = String(data.text || '').slice(0, 20000);
  if (!text.trim()) {
    return res.status(400).json({ error: 'Empty brief' });
  }

  const discipline = String(data.discipline || 'Project').slice(0, 80);
  const who = String(data.who || 'New').slice(0, 200);
  const email =
    typeof data.email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)
      ? data.email
      : '';
  const files = Array.isArray(data.files) ? data.files.filter((f) => f && f.url) : [];

  const title = 'New ' + discipline + ' brief: ' + who;

  // Markdown description: reply-to + file links up top, then the full brief in a
  // monospace block so it reads cleanly in Linear.
  const head = [];
  if (email) head.push('**Reply to:** ' + email);
  if (files.length) {
    head.push('**Files:**');
    files.forEach((f) => head.push('- [' + (f.name || 'file') + '](' + f.url + ')'));
  }
  const description = (head.length ? head.join('\n') + '\n\n---\n\n' : '') + '```\n' + text + '\n```';

  try {
    // Resolve the destination team from the API key's workspace.
    const teamsData = await linear(apiKey, 'query { teams(first: 250) { nodes { id key name } } }');
    const teams = (teamsData && teamsData.teams && teamsData.teams.nodes) || [];
    if (!teams.length) {
      return res.status(500).json({ error: 'No Linear teams found for this API key.' });
    }
    const wantKey = (process.env.LINEAR_TEAM_KEY || '').trim().toLowerCase();
    let team = wantKey
      ? teams.find((t) => t.key.toLowerCase() === wantKey || t.name.toLowerCase() === wantKey)
      : teams.length === 1
      ? teams[0]
      : null;
    if (!team) {
      return res.status(500).json({
        error: 'Set LINEAR_TEAM_KEY to one of: ' + teams.map((t) => t.key).join(', '),
      });
    }

    // Optional label, matched by name on the team.
    let labelIds;
    const labelName = (process.env.LINEAR_LABEL || '').trim();
    if (labelName) {
      const ld = await linear(
        apiKey,
        'query($id:String!){ team(id:$id){ labels(first:250){ nodes{ id name } } } }',
        { id: team.id }
      );
      const labels = (ld && ld.team && ld.team.labels && ld.team.labels.nodes) || [];
      const match = labels.find((l) => l.name.toLowerCase() === labelName.toLowerCase());
      if (match) labelIds = [match.id];
    }

    const input = { teamId: team.id, title: title, description: description };
    if (labelIds) input.labelIds = labelIds;

    const created = await linear(
      apiKey,
      'mutation($input: IssueCreateInput!){ issueCreate(input:$input){ success issue{ identifier url } } }',
      { input: input }
    );
    if (!created || !created.issueCreate || !created.issueCreate.success) {
      return res.status(502).json({ error: 'Could not file your brief just now. Please try again.' });
    }
    return res
      .status(200)
      .json({ ok: true, url: created.issueCreate.issue && created.issueCreate.issue.url });
  } catch (err) {
    console.error('Linear brief create failed', err);
    return res.status(502).json({
      error: 'Could not file your brief just now. Please try again, or email us at pierce@cognak.com.',
    });
  }
}
