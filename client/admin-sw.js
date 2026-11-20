/* =========================================================================
   Espace pro de Paule — service worker (portée /admin).
   Notifications sur le téléphone ou l'ordinateur, et une page « hors ligne ».
   Rien n'est mis en cache : les données restent sur le serveur.
   ========================================================================= */
"use strict";

var HORS_LIGNE = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>Hors ligne — Espace pro</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0B0E15;color:#E8ECF3;text-align:center;padding:24px}" +
  "b{display:block;font-size:20px;margin-bottom:8px}p{color:#9AA3B5;font-size:14px;line-height:1.5;max-width:320px;margin:0 auto 18px}" +
  "button{background:#4D86F2;color:#fff;border:0;border-radius:12px;padding:12px 18px;font-size:15px}</style></head><body><div>" +
  "<b>Pas de connexion</b><p>Votre espace pro a besoin d’internet. Vérifiez le wifi ou les données mobiles, puis réessayez.</p>" +
  '<button onclick="location.reload()">Réessayer</button></div></body></html>';

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

/* Ouverture de l'espace pro sans réseau : page d'explication plutôt qu'une erreur du navigateur */
self.addEventListener("fetch", function (e) {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(function () {
    return new Response(HORS_LIGNE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }));
});

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { corps: e.data ? e.data.text() : "" }; }
  var options = {
    body: d.corps || "",
    icon: "/media/app-192.png",
    badge: "/media/app-badge-96.png",
    lang: "fr",
    data: { lien: d.lien || "" },
  };
  // Le brief du matin remplace celui de la veille ; les autres s'additionnent
  if (d.type === "matin") options.tag = "matin";
  e.waitUntil(self.registration.showNotification(d.titre || "Espace pro", options));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var lien = (e.notification.data && e.notification.data.lien) || "";
  var cible = "/admin" + (lien ? "#" + lien : "");
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (fenetres) {
    for (var i = 0; i < fenetres.length; i++) {
      var f = fenetres[i];
      if (new URL(f.url).pathname.indexOf("/admin") === 0) {
        f.postMessage({ type: "aller", lien: lien });
        return f.focus();
      }
    }
    return self.clients.openWindow(cible);
  }));
});
