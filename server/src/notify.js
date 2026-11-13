// Alerte email à Paule (nouvelle demande, nouveau rendez-vous) via Resend.
// Facultatif : sans RESEND_API_KEY + NOTIFY_EMAIL, rien n'est envoyé.
async function notifier(sujet, texte) {
  const cle = process.env.RESEND_API_KEY;
  const a = process.env.NOTIFY_EMAIL;
  if (!cle || !a) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + cle, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || "Portfolio Paule Ackerman <onboarding@resend.dev>",
        to: a.split(",").map((s) => s.trim()).filter(Boolean),
        subject: sujet,
        text: texte + "\n\n— Ouvrir l'admin : " + (process.env.SITE_URL || "https://www.pauleackerman.com") + "/admin",
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) console.warn("[notify] Resend a répondu", r.status);
    return r.ok;
  } catch (e) {
    console.warn("[notify] envoi impossible :", e.message);
    return false;
  }
}

module.exports = { notifier };
