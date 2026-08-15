const express = require('express');
const router = express.Router();

const LIVRES = {
  'genese': 1, 'exode': 2, 'levitique': 3, 'nombres': 4, 'deuteronome': 5,
  'josue': 6, 'juges': 7, 'ruth': 8,
  '1 samuel': 9, '2 samuel': 10, 'premier samuel': 9, 'deuxieme samuel': 10,
  '1 rois': 11, '2 rois': 12, 'premier rois': 11, 'deuxieme rois': 12,
  '1 chroniques': 13, '2 chroniques': 14,
  'esdras': 15, 'nehemie': 16, 'esther': 17, 'job': 18,
  'psaume': 19, 'psaumes': 19,
  'proverbes': 20, 'ecclesiaste': 21,
  'cantique': 22, 'cantique des cantiques': 22,
  'esaie': 23, 'isaie': 23, 'jeremie': 24, 'lamentations': 25,
  'ezechiel': 26, 'daniel': 27, 'osee': 28, 'joel': 29,
  'amos': 30, 'abdias': 31, 'jonas': 32, 'michee': 33,
  'nahum': 34, 'habacuc': 35, 'sophonie': 36, 'aggee': 37,
  'zacharie': 38, 'malachie': 39,
  'matthieu': 40, 'marc': 41, 'luc': 42, 'jean': 43,
  'actes': 44, 'actes des apotres': 44, 'romains': 45,
  '1 corinthiens': 46, '2 corinthiens': 47,
  'premier corinthiens': 46, 'deuxieme corinthiens': 47,
  'galates': 48, 'ephesiens': 49, 'philippiens': 50, 'colossiens': 51,
  '1 thessaloniciens': 52, '2 thessaloniciens': 53,
  'premier thessaloniciens': 52, 'deuxieme thessaloniciens': 53,
  '1 timothee': 54, '2 timothee': 55,
  'premier timothee': 54, 'deuxieme timothee': 55,
  'tite': 56, 'philemon': 57, 'hebreux': 58,
  'jacques': 59,
  '1 pierre': 60, '2 pierre': 61,
  'premier pierre': 60, 'deuxieme pierre': 61,
  '1 jean': 62, '2 jean': 63, '3 jean': 64,
  'premier jean': 62, 'deuxieme jean': 63, 'troisieme jean': 64,
  'jude': 65, 'apocalypse': 66
};

const NOMS_FR = {
  1: 'Genese', 2: 'Exode', 3: 'Levitique', 4: 'Nombres', 5: 'Deuteronome',
  6: 'Josue', 7: 'Juges', 8: 'Ruth', 9: '1 Samuel', 10: '2 Samuel',
  11: '1 Rois', 12: '2 Rois', 13: '1 Chroniques', 14: '2 Chroniques',
  15: 'Esdras', 16: 'Nehemie', 17: 'Esther', 18: 'Job', 19: 'Psaumes',
  20: 'Proverbes', 21: 'Ecclesiaste', 22: 'Cantique des Cantiques',
  23: 'Esaie', 24: 'Jeremie', 25: 'Lamentations', 26: 'Ezechiel',
  27: 'Daniel', 28: 'Osee', 29: 'Joel', 30: 'Amos', 31: 'Abdias',
  32: 'Jonas', 33: 'Michee', 34: 'Nahum', 35: 'Habacuc', 36: 'Sophonie',
  37: 'Aggee', 38: 'Zacharie', 39: 'Malachie',
  40: 'Matthieu', 41: 'Marc', 42: 'Luc', 43: 'Jean', 44: 'Actes',
  45: 'Romains', 46: '1 Corinthiens', 47: '2 Corinthiens',
  48: 'Galates', 49: 'Ephesiens', 50: 'Philippiens', 51: 'Colossiens',
  52: '1 Thessaloniciens', 53: '2 Thessaloniciens',
  54: '1 Timothee', 55: '2 Timothee', 56: 'Tite', 57: 'Philemon',
  58: 'Hebreux', 59: 'Jacques', 60: '1 Pierre', 61: '2 Pierre',
  62: '1 Jean', 63: '2 Jean', 64: '3 Jean', 65: 'Jude', 66: 'Apocalypse'
};

function trouverLivre(texte) {
  const t = texte.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
  if (LIVRES[t] !== undefined) return LIVRES[t];
  for (const [cle, num] of Object.entries(LIVRES)) {
    if (t.startsWith(cle) || cle.startsWith(t)) return num;
  }
  return null;
}

async function handleVerset(req, res) {
  const livreNum = trouverLivre(req.params.livre);
  if (!livreNum) return res.status(404).json({ error: 'Livre non trouve.' });

  const chapitre = Number(req.params.chapitre);
  const verset = req.params.verset ? Number(req.params.verset) : null;
  const nomFr = NOMS_FR[livreNum];

  try {
    let url;
    if (verset) {
      url = `https://api.getbible.net/v2/lsg/${livreNum}/${chapitre}/${verset}.json`;
    } else {
      url = `https://api.getbible.net/v2/lsg/${livreNum}/${chapitre}.json`;
    }

    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('API error');
    const data = await r.json();

    let texte = '';
    let reference = '';

    if (verset) {
      texte = data.text || data.verse || '';
      reference = `${nomFr} ${chapitre}:${verset}`;
    } else {
      const versets = data.verses || [];
      texte = versets.map((v) => `${v.verse}. ${v.text}`).join(' ');
      reference = `${nomFr} ${chapitre}`;
    }

    texte = texte.replace(/\n/g, ' ').trim();
    res.json({ reference, texte, livre: nomFr, chapitre, verset });
  } catch {
    res.json({
      reference: verset ? `${nomFr} ${chapitre}:${verset}` : `${nomFr} ${chapitre}`,
      texte: null,
      livre: nomFr, chapitre, verset,
      erreur: 'Impossible de charger le texte du verset.'
    });
  }
}

let versetEnCours = { reference: '', texte: '', timestamp: 0 };

/** POST /api/bible/live — le telephone-micro envoie le verset detecte. */
router.post('/live', (req, res) => {
  const { reference, texte } = req.body || {};
  if (!reference) return res.status(400).json({ error: 'Reference requise.' });
  versetEnCours = { reference, texte: texte || '', timestamp: Date.now() };
  res.json({ ok: true });
});

/** GET /api/bible/live — l'ecran d'affichage recupere le verset en cours. */
router.get('/live', (req, res) => {
  res.json(versetEnCours);
});

router.get('/:livre/:chapitre/:verset', handleVerset);
router.get('/:livre/:chapitre', handleVerset);

module.exports = router;
