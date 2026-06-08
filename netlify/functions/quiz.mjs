import { getStore } from "@netlify/blobs";

// 🔑 Code organisateur (à saisir sur classement.html)
const CODE_ORGA = "AP26";

export default async (req) => {
  const store = getStore({ name: "quiz-mariage", consistency: "strong" });
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }
    const prenom = String(body.prenom || "").trim().slice(0, 40);
    const nom    = String(body.nom    || "").trim().slice(0, 40);
    const score  = Math.max(0, Math.min(999, parseInt(body.score, 10) || 0));
    const total  = Math.max(0, Math.min(999, parseInt(body.total, 10) || 0));
    let   id     = String(body.id || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 48);
    if (!prenom || !nom) return json({ error: "Prénom et nom requis" }, 400);
    if (!id) id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await store.setJSON("p_" + id, { id, prenom, nom, score, total, date: new Date().toISOString() });
    return json({ ok: true });
  }

  if (req.method === "GET") {
    const code = new URL(req.url).searchParams.get("code") || "";
    if (code !== CODE_ORGA) return json({ error: "Code invalide" }, 401);
    const { blobs } = await store.list({ prefix: "p_" });
    const participants = [];
    for (const b of blobs) { const v = await store.get(b.key, { type: "json" }); if (v) participants.push(v); }
    participants.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
    return json({ participants, count: participants.length });
  }
  return json({ error: "Méthode non autorisée" }, 405);
};
