/**
 * api.js — Client HTTP minimal vers l'API du serveur.
 * Toutes les requêtes portent le cookie de session (credentials: same-origin).
 * En cas d'erreur, une exception est levée avec le message français du serveur.
 */
const api = {
  async requete(methode, chemin, corps) {
    const options = {
      method: methode,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (corps !== undefined) options.body = JSON.stringify(corps);
    const reponse = await fetch('/api' + chemin, options);
    let donnees = {};
    try { donnees = await reponse.json(); } catch { /* réponse vide */ }
    if (!reponse.ok) {
      const err = new Error(donnees.error || 'Une erreur est survenue.');
      err.status = reponse.status;
      throw err;
    }
    return donnees;
  },
  get(chemin) { return this.requete('GET', chemin); },
  post(chemin, corps) { return this.requete('POST', chemin, corps); },
  put(chemin, corps) { return this.requete('PUT', chemin, corps); },
  del(chemin) { return this.requete('DELETE', chemin); },
};
