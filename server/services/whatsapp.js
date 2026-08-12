/**
 * whatsapp.js — Service d'envoi WhatsApp.
 *
 * ARCHITECTURE ÉVOLUTIVE : toutes les routes passent par ce service.
 * - Version 1 (actuelle) : génération de liens wa.me pré-remplis, l'envoi
 *   se fait manuellement depuis le téléphone du responsable.
 * - Version 2 (prévue)   : implémenter sendViaApi() avec Twilio ou
 *   Meta WhatsApp Cloud API, puis basculer PROVIDER sur 'api'.
 *   Rien d'autre n'est à modifier dans l'application.
 */

// 'lien' = wa.me manuel (v1) | 'api' = envoi automatisé (v2, à implémenter)
const PROVIDER = process.env.WHATSAPP_PROVIDER || 'lien';

/** Normalise un numéro au format international attendu par wa.me (chiffres uniquement). */
function normaliserNumero(numero) {
  if (!numero) return null;
  const chiffres = String(numero).replace(/[^\d]/g, '');
  return chiffres.length >= 8 ? chiffres : null;
}

/** Génère un lien wa.me vers un destinataire avec le message pré-rempli. */
function lienWaMe(numero, message) {
  const n = normaliserNumero(numero);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

/**
 * Prépare l'envoi d'une annonce à une liste de destinataires.
 * Retourne { canal, liens: [{membre_id, nom, lien}], sansNumero: [...] }.
 */
function preparerEnvoi(destinataires, message) {
  if (PROVIDER === 'api') {
    // Point d'extension v2 : appeler ici Twilio / Meta Cloud API.
    throw new Error("L'envoi automatisé par API WhatsApp n'est pas encore configuré.");
  }
  const liens = [];
  const sansNumero = [];
  for (const d of destinataires) {
    const lien = lienWaMe(d.whatsapp || d.telephone, message);
    const nomComplet = `${d.prenom} ${d.nom}`;
    if (lien) liens.push({ membre_id: d.id, nom: nomComplet, lien });
    else sansNumero.push({ membre_id: d.id, nom: nomComplet });
  }
  return { canal: 'whatsapp_lien', liens, sansNumero };
}

module.exports = { preparerEnvoi, lienWaMe, normaliserNumero };
