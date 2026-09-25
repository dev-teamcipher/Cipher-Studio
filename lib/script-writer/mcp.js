// Minimal MCP client over Streamable HTTP (JSON-RPC 2.0).
// Students paste their Nexlev MCP URL + API key in Settings; this connects directly.
class McpClient {
  constructor(url, key) {
    this.url = url;
    this.key = key || '';
    this.seq = 0;
    this.sessionId = null;
    this.tools = [];
    this.connected = false;
  }

  headers() {
    const h = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.key) h.Authorization = 'Bearer ' + this.key;
    if (this.key) h['x-api-key'] = this.key;
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    return h;
  }

  async raw(body) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    return res;
  }

  async request(method, params) {
    const id = ++this.seq;
    const res = await this.raw({ jsonrpc: '2.0', id, method, params });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`MCP HTTP ${res.status} on ${method}: ${t.slice(0, 300)}`);
    }
    const ct = res.headers.get('content-type') || '';
    const msgs = [];
    if (ct.includes('text/event-stream')) {
      const text = await res.text();
      for (const line of text.split('\n')) {
        const l = line.trim();
        if (l.startsWith('data:')) {
          try { msgs.push(JSON.parse(l.slice(5).trim())); } catch {}
        }
      }
    } else {
      try { msgs.push(await res.json()); } catch {}
    }
    const m = msgs.find((x) => x && x.id === id);
    if (!m) throw new Error('MCP: empty response for ' + method);
    if (m.error) throw new Error('MCP error on ' + method + ': ' + (m.error.message || JSON.stringify(m.error)));
    return m.result;
  }

  async notify(method, params) {
    try { await this.raw({ jsonrpc: '2.0', method, params }); } catch {}
  }

  async connect() {
    await this.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'cipher-ai-writer', version: '1.0.10' },
    });
    await this.notify('notifications/initialized', {});
    const r = await this.request('tools/list', {});
    this.tools = (r && r.tools) || [];
    this.connected = true;
    return this.tools;
  }

  toolName(suffix) {
    const t =
      this.tools.find((t) => t.name === suffix) ||
      this.tools.find((t) => t.name.endsWith(suffix));
    return t ? t.name : null;
  }

  // Call a tool by name-suffix; parses JSON text content when possible.
  async call(suffix, args) {
    const name = this.toolName(suffix);
    if (!name) throw new Error('Tool not available on this MCP server: ' + suffix);
    const r = await this.request('tools/call', { name, arguments: args });
    if (r && r.isError) {
      const msg = (r.content || []).map((c) => c.text || '').join(' ');
      throw new Error('MCP tool ' + suffix + ' failed: ' + msg.slice(0, 300));
    }
    const texts = ((r && r.content) || [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text);
    const parsed = [];
    for (const t of texts) {
      try { parsed.push(JSON.parse(t)); } catch {}
    }
    if (r && r.structuredContent) parsed.push(r.structuredContent);
    if (parsed.length) {
      // Prefer the richest parsed payload (Nexlev returns a summary + a full JSON blob).
      parsed.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length);
      return parsed[0];
    }
    return texts.join('\n');
  }
}

module.exports = { McpClient };

