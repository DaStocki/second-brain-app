// In-memory stand-in for the GitHub REST API the app uses (contents, git data, trees/blobs).
// Every write is recorded in `commits` so tests can assert one commit per user action.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha1 = t => crypto.createHash('sha1').update(t).digest('hex');

function loadFixture(dir = path.join(__dirname, 'fixtures', 'vault')) {
  const files = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files[path.relative(dir, p).split(path.sep).join('/')] = fs.readFileSync(p, 'utf8');
    }
  })(dir);
  return files;
}

async function mockGitHub(page, opts = {}) {
  const state = { files: loadFixture(), commits: [], offline: false, failNextRef: false, head: 'c0', trees: {}, newCommits: {}, n: 0 };
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await page.route('https://api.github.com/**', async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (state.offline) return route.abort('internetdisconnected');
    if (opts.token && req.headers()['authorization'] !== `Bearer ${opts.token}`) return route.fulfill({ status: 401, headers, body: '{}' });
    const url = new URL(req.url());
    const p = url.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    const json = (o, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(o) });
    const body = () => JSON.parse(req.postData() || '{}');

    if (p === '' || p === '/') return json({ full_name: 'test/vault', private: true });
    if (p.startsWith('/git/trees/') && req.method() === 'GET')
      return json({ tree: Object.entries(state.files).map(([path, t]) => ({ path, type: 'blob', sha: sha1(t) })) });
    if (p.startsWith('/git/blobs/')) {
      const s = p.split('/').pop(); const t = Object.values(state.files).find(x => sha1(x) === s);
      return t == null ? json({}, 404) : json({ content: Buffer.from(t).toString('base64') });
    }
    if (p.startsWith('/git/ref/heads/')) return json({ object: { sha: state.head } });
    if (p.startsWith('/git/commits/') && req.method() === 'GET') return json({ tree: { sha: 'tree-' + p.split('/').pop() } });
    if (p === '/git/trees' && req.method() === 'POST') { const sha = 't' + (++state.n); state.trees[sha] = body().tree; return json({ sha }) }
    if (p === '/git/commits' && req.method() === 'POST') { const b = body(); const sha = 'c' + (++state.n); state.newCommits[sha] = b; return json({ sha }) }
    if (p.startsWith('/git/refs/heads/') && req.method() === 'PATCH') {
      if (state.failNextRef) { state.failNextRef = false; state.head = 'c-other-' + (++state.n); return json({ message: 'Update is not a fast forward' }, 422) }
      const b = body(); const c = state.newCommits[b.sha];
      if (!c || c.parents[0] !== state.head) return json({ message: 'Update is not a fast forward' }, 422);
      for (const e of state.trees[c.tree]) state.files[e.path] = e.content;
      state.commits.push({ message: c.message, files: state.trees[c.tree].map(e => e.path) });
      state.head = b.sha; return json({ object: { sha: b.sha } });
    }
    if (p.startsWith('/contents/')) {
      const f = decodeURIComponent(p.slice('/contents/'.length));
      if (req.method() === 'PUT') {
        const b = body(); state.files[f] = Buffer.from(b.content, 'base64').toString('utf8');
        state.commits.push({ message: b.message, files: [f] }); state.head = 'c' + (++state.n);
        return json({ content: { sha: sha1(state.files[f]) } });
      }
      const t = state.files[f];
      return t == null ? json({ message: 'Not Found' }, 404) : json({ content: Buffer.from(t).toString('base64'), sha: sha1(t) });
    }
    return json({ message: 'unhandled ' + p }, 500);
  });
  return state;
}

module.exports = { mockGitHub, loadFixture };
