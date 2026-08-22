/**
 * routes/wave.js — Integration Wave Checkout API.
 */
const express = require('express');
const https = require('https');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireDirection } = require('../middleware/auth');

const router = express.Router();

const WAVE_API_KEY = process.env.WAVE_API_KEY || '';
const WAVE_WEBHOOK_SECRET = process.env.WAVE_WEBHOOK_SECRET || '';
const WAVE_API_URL = 'https://api.wave.com/v1/checkout/sessions';

function waveRequest(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(WAVE_API_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + WAVE_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { reject(new Error('Reponse Wave invalide')); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/** POST /api/wave/checkout — Creer une session de paiement Wave. */
router.post('/checkout', requireAuth, requireDirection, async (req, res) => {
  if (!WAVE_API_KEY) {
    return res.status(503).json({ error: 'Paiement Wave non configure. Contactez l\'administrateur.' });
  }

  const { plan } = req.body || {};
  if (!plan || !['mensuel', 'annuel'].includes(plan)) {
    return res.status(400).json({ error: 'Plan invalide.' });
  }

  const montant = plan === 'annuel' ? 50000 : 5000;
  const org = req.org;
  const baseUrl = req.protocol + '://' + req.get('host');

  const debut = new Date();
  const fin = new Date();
  fin.setMonth(fin.getMonth() + (plan === 'annuel' ? 12 : 1));

  const aboId = await db.insert(`
    INSERT INTO abonnements (org_id, plan, montant, moyen_paiement, reference_paiement, date_debut, date_fin, statut)
    VALUES (?, ?, ?, 'wave', '', ?, ?, 'en_attente')`,
    req.org_id, plan, montant,
    debut.toISOString().split('T')[0], fin.toISOString().split('T')[0]
  );

  try {
    const result = await waveRequest({
      amount: String(montant),
      currency: 'XOF',
      client_reference: 'ZAURA-' + req.org_id + '-' + aboId,
      success_url: baseUrl + '/#/abonnement?paiement=succes',
      error_url: baseUrl + '/#/abonnement?paiement=echec',
    });

    if (result.status >= 400 || !result.data || !result.data.wave_launch_url) {
      await db.run("UPDATE abonnements SET statut = 'rejete' WHERE id = ?", aboId);
      const msg = result.data && result.data.message ? result.data.message : 'Erreur Wave';
      return res.status(502).json({ error: 'Erreur Wave : ' + msg });
    }

    await db.run('UPDATE abonnements SET reference_paiement = ? WHERE id = ?',
      result.data.id || '', aboId);

    res.json({
      checkout_url: result.data.wave_launch_url,
      session_id: result.data.id,
    });
  } catch (err) {
    console.error('Erreur Wave checkout:', err);
    await db.run("UPDATE abonnements SET statut = 'rejete' WHERE id = ?", aboId);
    res.status(502).json({ error: 'Impossible de contacter Wave. Reessayez.' });
  }
});

/** POST /api/wave/webhook — Callback de Wave apres paiement. */
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const raw = typeof req.body === 'string' ? req.body : req.body.toString('utf8');

  if (WAVE_WEBHOOK_SECRET) {
    const signature = req.headers['wave-signature'] || req.headers['x-wave-signature'] || '';
    const expected = crypto.createHmac('sha256', WAVE_WEBHOOK_SECRET).update(raw).digest('hex');
    if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return res.status(403).json({ error: 'Signature invalide.' });
    }
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return res.status(400).json({ error: 'Payload invalide.' });
  }

  const ref = payload.client_reference || '';
  const status = payload.checkout_status || payload.payment_status || '';

  if (!ref.startsWith('ZAURA-')) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const parts = ref.split('-');
  const aboId = parts.length >= 3 ? Number(parts[2]) : null;
  if (!aboId) return res.status(200).json({ ok: true });

  const abo = await db.get('SELECT * FROM abonnements WHERE id = ?', aboId);
  if (!abo) return res.status(200).json({ ok: true });

  if (status === 'complete' || status === 'succeeded') {
    await db.run("UPDATE abonnements SET statut = 'actif', reference_paiement = ? WHERE id = ?",
      payload.id || payload.transaction_id || abo.reference_paiement, aboId);
    await db.run("UPDATE organisations SET statut = 'actif', plan = ? WHERE id = ?",
      abo.plan, abo.org_id);
  } else if (status === 'expired' || status === 'failed' || status === 'cancelled') {
    await db.run("UPDATE abonnements SET statut = 'rejete' WHERE id = ?", aboId);
  }

  res.status(200).json({ ok: true });
});

module.exports = router;
