import { getStore } from "@netlify/blobs";

/* 🔑 Code organisateur (à saisir sur classement.html) — insensible à la casse */
const CODE_ORGA = "AP26";

function codeOK(req) {
  const code = new URL(req.url).searchParams.get("code") || "";
  return code.trim().toUpperCase() === CODE_ORGA.toUpperCase();
}

export default async (req) => {
  const store = getStore({ name: "quiz-mariage", consistency: "strong" });
  const url = new URL(req.url);
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }

    // Bascule "réponses dévoilées" (organisateur uniquement)
    if (body && body.action === "reveal") {
      if (!codeOK(req)) return json({ error: "Code invalide" }, 401);
      const value = !!body.value;
      await store.setJSON("reveal", { revealed: value });
      return json({ ok: true, revealed: value });
    }

    // Sinon : un invité envoie son score
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
    // Statut public : les réponses sont-elles dévoilées ? (les invités appellent ça)
    if (url.searchParams.get("status")) {
      let st = null;
      try { st = await store.get("reveal", { type: "json" }); } catch (e) {}
      return json({ revealed: !!(st && st.revealed) });
    }
    // Classement (organisateur)
    if (!codeOK(req)) return json({ error: "Code invalide" }, 401);
    const { blobs } = await store.list({ prefix: "p_" });
    const participants = [];
    for (const b of blobs) {
      const v = await store.get(b.key, { type: "json" });
      if (v) participants.push(v);
    }
    participants.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
    return json({ participants, count: participants.length });
  }

  if (req.method === "DELETE") {
    if (!codeOK(req)) return json({ error: "Code invalide" }, 401);
    const { blobs } = await store.list({ prefix: "p_" });
    for (const b of blobs) { await store.delete(b.key); }
    return json({ ok: true, deleted: blobs.length });
  }

  return json({ error: "Méthode non autorisée" }, 405);
};
