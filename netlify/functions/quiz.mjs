import { getStore } from "@netlify/blobs";

/* 🔑 Code organisateur (à saisir sur classement.html) — insensible à la casse */
const CODE_ORGA = "AP26";

function codeOK(req) {
  const code = new URL(req.url).searchParams.get("code") || "";
  return code.trim().toUpperCase() === CODE_ORGA.toUpperCase();
}

/* Clé unique par personne : "prénom nom" normalisé (sans accents/casse/espaces) -> anti-doublon */
function nameKey(prenom, nom) {
  const s = (prenom + " " + nom)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // enlève les accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return "p_" + (s || "anonyme");
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

    // Un invité envoie son score
    const prenom   = String(body.prenom || "").trim().slice(0, 40);
    const nom      = String(body.nom    || "").trim().slice(0, 40);
    const score    = Math.max(0, Math.min(999, parseInt(body.score, 10) || 0));
    const total    = Math.max(0, Math.min(999, parseInt(body.total, 10) || 0));
    const duration = Math.max(0, parseInt(body.duration, 10) || 0); // en millisecondes
    if (!prenom || !nom) return json({ error: "Prénom et nom requis" }, 400);

    const key = nameKey(prenom, nom);
    // Anti-doublon : si ce prénom+nom a déjà joué, on garde la 1re participation
    let exists = false;
    try { const ex = await store.get(key, { type: "json" }); if (ex) exists = true; } catch (e) {}
    if (exists) return json({ ok: true, duplicate: true });

    await store.setJSON(key, { prenom, nom, score, total, duration, date: new Date().toISOString() });
    return json({ ok: true });
  }

  if (req.method === "GET") {
    // Statut public : les réponses sont-elles dévoilées ?
    if (url.searchParams.get("status")) {
      let st = null;
      try { st = await store.get("reveal", { type: "json" }); } catch (e) {}
      return json({ revealed: !!(st && st.revealed) });
    }
    // Nombre de participants (public, pour le compteur d'accueil)
    if (url.searchParams.get("count")) {
      const { blobs } = await store.list({ prefix: "p_" });
      return json({ count: blobs.length });
    }
    // Classement (organisateur)
    if (!codeOK(req)) return json({ error: "Code invalide" }, 401);
    const { blobs } = await store.list({ prefix: "p_" });
    const participants = [];
    for (const b of blobs) {
      const v = await store.get(b.key, { type: "json" });
      if (v) participants.push(v);
    }
    // tri : meilleur score, puis le plus rapide (chrono), puis le plus tôt arrivé
    participants.sort((a, b) =>
      b.score - a.score ||
      (a.duration ?? 1e15) - (b.duration ?? 1e15) ||
      String(a.date).localeCompare(String(b.date))
    );
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
