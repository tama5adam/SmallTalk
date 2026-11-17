/**
 * SmallTalk – Cloudflare Worker: passcode-gated Whisper proxy
 *
 * Dashboard → Workers → your worker → Settings → Variables and Secrets:
 *   OPENAI_API_KEY   (secret)  your OpenAI API key
 *   PASSCODE         (secret)  shared passcode you give your students
 *   ALLOWED_ORIGINS  (text)    comma-separated, e.g. https://YOU.github.io,http://localhost:8000
 *
 * The browser never sees the API key. Requests need the right Origin AND passcode.
 */
const MAX_BYTES = 8 * 1024 * 1024; // ~8 MB is plenty for a 2-minute recording
const enc = new TextEncoder();

function safeEqual(a, b) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);

    const cors = {
      "Access-Control-Allow-Origin": originOk ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "X-Passcode",
      "Vary": "Origin",
    };
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    if (!originOk) return reply({ error: "Origin not allowed" }, 403);

    const sent = request.headers.get("X-Passcode") || "";
    if (!env.PASSCODE || !safeEqual(sent, env.PASSCODE)) return reply({ error: "Unauthorized" }, 401);

    let audio;
    try {
      audio = (await request.formData()).get("audio");
    } catch {
      return reply({ error: "Invalid form data" }, 400);
    }
    if (!audio || typeof audio === "string" || audio.size === 0 || audio.size > MAX_BYTES) {
      return reply({ error: "Missing or oversized audio" }, 400);
    }

    const out = new FormData();
    out.append("file", audio, audio.name || "speech.webm");
    out.append("model", "whisper-1");
    out.append("language", "en");
    out.append("temperature", "0");
    out.append("prompt", "Verbatim transcript of a Cambridge English speaking exam candidate, including hesitations and grammar errors.");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: out,
    });
    if (!res.ok) return reply({ error: "Upstream transcription error" }, 502);

    const data = await res.json();
    return reply({ text: data.text || "" });
  },
};
