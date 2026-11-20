// Alerte email à Paule (nouvelle demande, nouveau rendez-vous, brief du matin) via Resend.
// Facultatif : sans RESEND_API_KEY + NOTIFY_EMAIL, rien n'est envoyé.
// opts : { html (version mise en forme), delai (ms) }
async function notifier(sujet, texte, opts) {
  const cle = process.env.RESEND_API_KEY;
  const a = process.env.NOTIFY_EMAIL;
  if (!cle || !a) return false;
  opts = opts || {};
  try {
    const corps = {
      from: process.env.NOTIFY_FROM || "Portfolio Paule Ackerman <onboarding@resend.dev>",
      to: a.split(",").map((s) => s.trim()).filter(Boolean),
      subject: sujet,
      text: texte + "\n\n— Ouvrir l'admin : " + (process.env.SITE_URL || "https://www.pauleackerman.com") + "/admin",
    };
    if (opts.html) corps.html = opts.html;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + cle, "Content-Type": "application/json" },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(opts.delai || 4000),
    });
    if (!r.ok) console.warn("[notify] Resend a répondu", r.status);
    return r.ok;
  } catch (e) {
    console.warn("[notify] envoi impossible :", e.message);
    return false;
  }
}

module.exports = { notifier };
