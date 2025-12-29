/**
 * COMPAGNON DIGITAL WORKSPACE
 * Développeur : Fabrice Faucheux
 * Expert GAS : Assistant Technique
 */

// --- CONFIGURATION DYNAMIQUE ---
const CONFIG = {
  // IDs des ressources Google (À REMPLACER)
  ID_DOSSIER_CONNAISSANCES: "ID_DOSSIER_DRIVE",
  ID_SHEET_LOGS: "ID_SHEETS_LOGS", // Ce fichier servira aussi pour le mapping
  
  // Configuration Sheet
  NOM_FEUILLE_MAPPING: "INDEX_DOCS", // Nom de l'onglet pour la base de données documentaire
  
  // Configuration API Gemini
  API_VERSION: 'v1beta',
  BASE_URL: 'https://generativelanguage.googleapis.com',
  NOM_MODELE: "gemini-2.5-flash",
  
  // Sécurités
  MAX_ESSAIS_INDEXATION: 30 // Timeout ~60 secondes pour l'indexation
};

// ==========================================
// 1. INTERFACE UTILISATEUR & INITIALISATION
// ==========================================

/**
 * Point d'entrée de l'application Web.
 */
function doGet() {
  const gabarit = HtmlService.createTemplateFromFile('Index');
  gabarit.niveauExpertise = recupererNiveauExpertise();
  
  return gabarit.evaluate()
      .setTitle('Compagnon Digital Workspace')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inclusion de fichiers partiels (CSS/JS) côté HTML.
 */
function inclure(nomFichier) {
  return HtmlService.createHtmlOutputFromFile(nomFichier).getContent();
}

/**
 * Récupère la clé API de manière sécurisée.
 */
function recupererCleApi() {
  const cle = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!cle) throw new Error("⛔ Erreur critique : Clé API 'GEMINI_API_KEY' manquante dans les propriétés du script.");
  return cle;
}

/**
 * Récupère l'ID du magasin actif (File Search Store).
 */
function recupererNomStore() {
  return PropertiesService.getScriptProperties().getProperty('NOM_STORE_GEMINI_ACTIF') || "";
}

// ==========================================
// 2. CŒUR DE L'IA (RAG & ORCHESTRATION)
// ==========================================

/**
 * Interroge l'API Gemini avec le contexte des documents.
 * @param {string} question - Question utilisateur.
 * @param {string} niveau - Niveau d'expertise.
 */
function interrogerIA(question, niveau) {
  const cleApi = recupererCleApi();
  const nomStoreActif = recupererNomStore();

  // 1. Construction du Prompt Système
  const instructionSysteme = `Tu es un mentor technique expert chez Cooperl. Ton interlocuteur est de niveau : ${niveau}.
  Instructions :
  - Utilise EXCLUSIVEMENT les documents fournis dans le contexte pour répondre.
  - Si la réponse n'est pas dans les documents, dis "Je ne trouve pas cette information dans la base documentaire".
  - Cite tes sources si possible.
  - Réponds en Markdown.`;

  const chargeUtile = {
    contents: [{ parts: [{ text: `${instructionSysteme}\n\nQuestion : ${question}` }] }],
    tools: [{ file_search: { file_search_store_names: [nomStoreActif] } }]
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(chargeUtile),
    muteHttpExceptions: true
  };

  try {
    // 2. Appel API
    const url = `${CONFIG.BASE_URL}/${CONFIG.API_VERSION}/models/${CONFIG.NOM_MODELE}:generateContent?key=${cleApi}`;
    const reponse = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(reponse.getContentText());

    if (json.error) {
      console.error("Erreur API Gemini:", json.error);
      return { texte: `Erreur API : ${json.error.message}`, sources: [] };
    }

    // 3. Traitement de la réponse
    if (json.candidates && json.candidates[0].content) {
      const texte = json.candidates[0].content.parts.map(p => p.text).join('');
      let sources = [];
      
      const metadata = json.candidates[0].groundingMetadata;
      if (metadata && metadata.groundingChunks) {
        const titresVus = new Set();
        
        metadata.groundingChunks.forEach(chunk => {
          const idGemini = chunk.retrievedContext?.title; // Gemini renvoie souvent le nom du fichier ici
          
          if (idGemini && !titresVus.has(idGemini)) {
            titresVus.add(idGemini);
            // Récupération intelligente (Cache -> Sheet)
            const infosSource = recupererInfosSource(idGemini);
            
            sources.push({
              titre: infosSource.titre,
              url: infosSource.url,
              extrait: chunk.retrievedContext?.text?.substring(0, 150) + "..."
            });
          }
        });
      }
      return { texte, sources: sources.slice(0, 5) };
    }
    
    return { texte: "Pas de réponse générée.", sources: [] };

  } catch (e) {
    console.error("Exception interrogerIA:", e);
    return { texte: "Une erreur technique est survenue.", sources: [] };
  }
}

// ==========================================
// 3. GESTION DES DONNÉES (SHEETS & CACHE)
// ==========================================

/**
 * Accède à la feuille de mapping ou la crée si nécessaire.
 */
function obtenirFeuilleMapping_() {
  const ss = SpreadsheetApp.openById(CONFIG.ID_SHEET_LOGS);
  let feuille = ss.getSheetByName(CONFIG.NOM_FEUILLE_MAPPING);
  
  if (!feuille) {
    feuille = ss.insertSheet(CONFIG.NOM_FEUILLE_MAPPING);
    feuille.appendRow(["ID_GEMINI", "TITRE_DOC", "URL_DRIVE", "DATE_MAJ"]); // En-têtes
    feuille.setFrozenRows(1);
    console.log(`⚠️ Feuille ${CONFIG.NOM_FEUILLE_MAPPING} créée.`);
  }
  return feuille;
}

/**
 * Enregistre le lien Fichier Gemini <-> URL Drive dans le Sheet.
 */
function sauvegarderMapping(idGemini, titre, url) {
  const feuille = obtenirFeuilleMapping_();
  // Recherche rapide via TextFinder pour éviter les doublons
  const recherche = feuille.getRange("A:A").createTextFinder(idGemini).matchEntireCell(true).findNext();
  const horodatage = new Date();
  
  if (recherche) {
    // Mise à jour
    feuille.getRange(recherche.getRow(), 2, 1, 3).setValues([[titre, url, horodatage]]);
  } else {
    // Création
    feuille.appendRow([idGemini, titre, url, horodatage]);
  }
}

/**
 * Récupère les infos d'un document (Cache Service -> Google Sheet -> Fallback).
 */
function recupererInfosSource(idGemini) {
  // 1. Cache mémoire (Rapide)
  const cacheKey = `DOC_${idGemini}`; 
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get(cacheKey);
  
  if (cachedData) return JSON.parse(cachedData);

  // 2. Google Sheet (Source de vérité)
  const feuille = obtenirFeuilleMapping_();
  const recherche = feuille.getRange("A:A").createTextFinder(idGemini).matchEntireCell(true).findNext();
  
  if (recherche) {
    const data = feuille.getRange(recherche.getRow(), 2, 1, 2).getValues()[0]; // Titre (B), URL (C)
    const infos = { titre: data[0], url: data[1] };
    
    // Mise en cache pour 6 heures
    cache.put(cacheKey, JSON.stringify(infos), 21600);
    return infos;
  }
  
  // 3. Fallback
  return { url: "#", titre: idGemini };
}

/**
 * Vide le Sheet de mapping (sauf en-têtes).
 */
function viderTableCorrespondance() {
  const feuille = obtenirFeuilleMapping_();
  const derniereLigne = feuille.getLastRow();
  if (derniereLigne > 1) {
    feuille.getRange(2, 1, derniereLigne - 1, 4).clearContent();
  }
  console.log("🧹 Base de mapping nettoyée.");
}

// ==========================================
// 4. SYNCHRONISATION (NUIT)
// ==========================================

/**
 * Fonction principale de maintenance (Trigger).
 */
function synchroniserBaseConnaissances() {
  console.time("Synchro");
  
  // 1. Nettoyage
  viderTableCorrespondance();
  supprimerStoreComplet();

  // 2. Création nouveau Store
  try {
    const nouveauStore = appelerApiGemini_('fileSearchStores', 'post', {
      displayName: `Base Cooperl - ${new Date().toLocaleDateString()}`
    });
    PropertiesService.getScriptProperties().setProperty('NOM_STORE_GEMINI_ACTIF', nouveauStore.name);
    console.log(`🚀 Nouveau magasin créé : ${nouveauStore.name}`);

    // 3. Indexation Fichiers
    const dossier = DriveApp.getFolderById(CONFIG.ID_DOSSIER_CONNAISSANCES);
    const fichiers = dossier.getFiles();
    let stats = { total: 0, ok: 0, ko: 0 };

    while (fichiers.hasNext()) {
      const fichier = fichiers.next();
      const mime = fichier.getMimeType();
      
      // Filtre sur les types supportés
      if ([MimeType.GOOGLE_DOCS, MimeType.GOOGLE_SLIDES, MimeType.PDF].includes(mime)) {
        stats.total++;
        try {
          uploaderFichierVersGemini(fichier, nouveauStore.name);
          stats.ok++;
        } catch (e) {
          console.error(`❌ Échec ${fichier.getName()}: ${e.message}`);
          stats.ko++;
        }
      }
    }
    console.log("✅ Synchro terminée.", stats);

  } catch (e) {
    console.error("Erreur critique Synchro:", e);
  }
  console.timeEnd("Synchro");
}

function uploaderFichierVersGemini(fichier, nomStore) {
  const nom = fichier.getName();
  const mime = fichier.getMimeType();
  
  // Conversion PDF à la volée pour les Docs/Slides
  let blob = [MimeType.GOOGLE_DOCS, MimeType.GOOGLE_SLIDES].includes(mime) 
    ? fichier.getAs(MimeType.PDF) 
    : fichier.getBlob();

  // 1. Upload
  const geminiFile = uploadBlobMultipart_(blob);
  
  // 2. Liaison au Store
  const operation = importFileToStore_(nomStore, geminiFile.name);
  attendreOperation_(operation.name);

  // 3. Sauvegarde Mapping dans Sheet (Nom Fichier -> URL)
  sauvegarderMapping(nom, nom, fichier.getUrl());
}

// ==========================================
// 5. UTILITAIRES API & SYSTÈME
// ==========================================

function uploadBlobMultipart_(blob) {
  const metadata = { file: { displayName: blob.getName() } };
  const boundary = "Bound_" + Utilities.getUuid(); // Boundary unique
  
  let entete = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  entete += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${blob.getName()}"\r\nContent-Type: ${blob.getContentType()}\r\n\r\n`;
  
  const payload = Utilities.newBlob(entete).getBytes()
    .concat(blob.getBytes())
    .concat(Utilities.newBlob(`\r\n--${boundary}--`).getBytes());

  const options = {
    method: "post",
    contentType: `multipart/related; boundary=${boundary}`,
    payload: payload,
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/upload/${CONFIG.API_VERSION}/files?uploadType=multipart&key=${recupererCleApi()}`, options);
  if (res.getResponseCode() !== 200) throw new Error(`Erreur Upload: ${res.getContentText()}`);
  
  return JSON.parse(res.getContentText()).file;
}

function importFileToStore_(storeName, geminiFileName) {
  return appelerApiGemini_(`${storeName}:importFile`, 'post', { fileName: geminiFileName });
}

function attendreOperation_(operationName) {
  let op;
  let essais = 0;
  do {
    if (essais >= CONFIG.MAX_ESSAIS_INDEXATION) throw new Error("Timeout Indexation");
    Utilities.sleep(2000);
    op = appelerApiGemini_(operationName, 'get');
    essais++;
  } while (!op.done);
  
  if (op.error) throw new Error(`Erreur indexation: ${JSON.stringify(op.error)}`);
  return op;
}

function appelerApiGemini_(endpoint, method, payload = null) {
  const url = `${CONFIG.BASE_URL}/${CONFIG.API_VERSION}/${endpoint}?key=${recupererCleApi()}`;
  const options = { method: method, contentType: 'application/json', muteHttpExceptions: true };
  if (payload) options.payload = JSON.stringify(payload);

  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() >= 300) throw new Error(res.getContentText());
  
  return res.getContentText() ? JSON.parse(res.getContentText()) : {};
}

function supprimerStoreComplet() {
  const nomStore = recupererNomStore();
  if (!nomStore) return;
  try {
    appelerApiGemini_(nomStore, 'delete');
    PropertiesService.getScriptProperties().deleteProperty('NOM_STORE_GEMINI_ACTIF');
  } catch (e) { console.warn("Impossible de supprimer le store (déjà absent ?)"); }
}

// ==========================================
// 6. LOGS & UTILISATEURS
// ==========================================

function enregistrerFeedback(donnees) {
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.ID_SHEET_LOGS).getSheets()[0];
    sheet.appendRow([
      new Date(), 
      Session.getActiveUser().getEmail(), 
      donnees.question, 
      donnees.reponse, 
      donnees.estPositif ? "👍" : "👎", 
      donnees.commentaire || ""
    ]);
    return true;
  } catch (e) { return false; }
}

function sauvegarderNiveauExpertise(n) { 
  PropertiesService.getScriptProperties().setProperty(`NIV_${Session.getActiveUser().getEmail()}`, n); 
}

function recupererNiveauExpertise() { 
  return PropertiesService.getScriptProperties().getProperty(`NIV_${Session.getActiveUser().getEmail()}`) || 'Débutant';
}

function configurerAutomatismeNuit() {
  const declencheurs = ScriptApp.getProjectTriggers();
  declencheurs.forEach(t => {
    if (t.getHandlerFunction() === 'synchroniserBaseConnaissances') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('synchroniserBaseConnaissances').timeBased().everyDays(1).atHour(2).create();
  console.log("✅ Trigger configuré (2h00).");
}

/**
 * UTILITAIRE MIGRATION (À lancer une fois si vous aviez déjà des données)
 * Transfère les données de ScriptProperties vers le Sheet.
 */
function utilitaireMigrationVersSheet() {
  const props = PropertiesService.getScriptProperties();
  const data = props.getProperties();
  let count = 0;
  for (const key in data) {
    if (key.startsWith("MAP_")) {
      try {
        const nomFichier = key.substring(4).replace(/_/g, ' '); // Tentative reconstruction nom
        const infos = JSON.parse(data[key]);
        sauvegarderMapping(nomFichier, infos.titre, infos.url);
        count++;
      } catch(e) {}
    }
  }
  console.log(`Migration terminée : ${count} items copiés.`);
}
