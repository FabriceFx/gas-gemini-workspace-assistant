/**
* COMPAGNON DIGITAL WORKSPACE
* Développeur : Fabrice Faucheux
* Mission : Assistance interne sur l'écosystème Google Workspace
*/


// --- CONFIGURATION DYNAMIQUE ---
const CONFIG = {
 ID_DOSSIER_CONNAISSANCES: "ID_DOSSIER_DRIVE",
 ID_SHEET_LOGS: "ID_SHEETS_LOGS",
 API_VERSION: 'v1beta',
 BASE_URL: 'https://generativelanguage.googleapis.com'
};


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


function inclure(nomFichier) {
 return HtmlService.createHtmlOutputFromFile(nomFichier).getContent();
}


function recupererCleApi() {
 const cle = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
 if (!cle) throw new Error("Clé API manquante.");
 return cle;
}


/**
* Récupère l'ID du magasin actif depuis la mémoire du script.
*/
function recupererNomStore() {
 return PropertiesService.getScriptProperties().getProperty('NOM_STORE_GEMINI_ACTIF') || "";
}


// ==========================================
// 1. CŒUR DE L'IA ET GESTION DES SOURCES
// ==========================================


function interrogerIA(question, niveau) {
 const cleApi = recupererCleApi();
 const nomModele = "gemini-2.5-flash";
 const url = `${CONFIG.BASE_URL}/${CONFIG.API_VERSION}/models/${nomModele}:generateContent?key=${cleApi}`;
 const nomStoreActif = recupererNomStore();
  const instructionSysteme = `Tu es un expert technique interne Cooperl. Niveau utilisateur : ${niveau}.
 Utilise les documents fournis pour répondre précisément.`;


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
   const reponse = UrlFetchApp.fetch(url, options);
   const json = JSON.parse(reponse.getContentText());
  
   if (json.error) return { texte: `Erreur API : ${json.error.message}`, sources: [] };


   if (json.candidates && json.candidates[0].content) {
     const texte = json.candidates[0].content.parts.map(p => p.text).join('');
     let sources = [];


     const metadata = json.candidates[0].groundingMetadata;
     if (metadata && metadata.groundingChunks) {
       const titresVus = new Set();
       metadata.groundingChunks.forEach(chunk => {
         const identifiantGemini = chunk.retrievedContext?.title;
         if (identifiantGemini && !titresVus.has(identifiantGemini)) {
           titresVus.add(identifiantGemini);
           const infosSource = recupererInfosSource(identifiantGemini);
           sources.push({
             titre: infosSource.titre,
             url: infosSource.url,
             extrait: chunk.retrievedContext?.text?.substring(0, 150) + "..."
           });
         }
       });
     }
     return { texte, sources: sources.slice(0, 3) };
   }
   return { texte: "Pas de réponse générée.", sources: [] };
 } catch (e) {
   return { texte: "Erreur technique IA.", sources: [] };
 }
}


function recupererInfosSource(identifiant) {
 const idPur = identifiant.includes('/') ? identifiant.split('/').pop() : identifiant;
 const mapping = PropertiesService.getScriptProperties().getProperty(`MAP_${idPur}`);
 if (mapping) return JSON.parse(mapping);


 const fichiers = DriveApp.getFilesByName(identifiant);
 if (fichiers.hasNext()) {
   const f = fichiers.next();
   return { url: f.getUrl(), titre: f.getName() };
 }
 return { url: "#", titre: identifiant };
}


// ==========================================
// 2. ADMINISTRATION ET NETTOYAGE
// ==========================================


function viderTableCorrespondance() {
 const proprietes = PropertiesService.getScriptProperties();
 const toutesLesCles = proprietes.getKeys();
 let compteur = 0;
 toutesLesCles.forEach(cle => {
   if (cle.startsWith('MAP_')) {
     proprietes.deleteProperty(cle);
     compteur++;
   }
 });
 Logger.log(`✅ Nettoyage terminé : ${compteur} liens supprimés.`);
}


function supprimerStoreComplet() {
 const nomStore = recupererNomStore();
 if (!nomStore) return;
 Logger.log(`🗑️ Suppression du magasin : ${nomStore}`);
 try {
   callGeminiApi_(nomStore, 'delete');
   PropertiesService.getScriptProperties().deleteProperty('NOM_STORE_GEMINI_ACTIF');
   Logger.log("✅ Magasin supprimé.");
 } catch (e) {
   Logger.log(`ℹ️ Info : Magasin déjà supprimé ou inaccessible.`);
 }
}


function synchroniserBaseConnaissances() {
 // 1. Nettoyage local et distant
 viderTableCorrespondance();
 supprimerStoreComplet();
  // 2. Créer le nouveau magasin propre
 const nouveauStore = callGeminiApi_('fileSearchStores', 'post', {
   displayName: "Base Cooperl Workspace"
 });
  // 3. Enregistrer l'ID
 PropertiesService.getScriptProperties().setProperty('NOM_STORE_GEMINI_ACTIF', nouveauStore.name);
 Logger.log(`🚀 Nouveau magasin actif : ${nouveauStore.name}`);


 // 4. Indexation
 const dossier = DriveApp.getFolderById(CONFIG.ID_DOSSIER_CONNAISSANCES);
 const fichiers = dossier.getFiles();
 while (fichiers.hasNext()) {
   const fichier = fichiers.next();
   if ([MimeType.GOOGLE_DOCS, MimeType.GOOGLE_SLIDES, MimeType.PDF].includes(fichier.getMimeType())) {
     try {
       Logger.log(`Traitement : ${fichier.getName()}`);
       uploadDriveFileToFileSearchStore(fichier.getId(), nouveauStore.name);
     } catch (e) {
       Logger.log(`⚠️ Échec sur ${fichier.getName()} : ${e.message}`);
     }
   }
 }
 Logger.log("✅ Synchronisation nocturne terminée.");
}


function uploadDriveFileToFileSearchStore(driveFileId, storeName) {
 const fichier = DriveApp.getFileById(driveFileId);
 const url = fichier.getUrl();
 const nom = fichier.getName();
 const mime = fichier.getMimeType();
 const blob = [MimeType.GOOGLE_DOCS, MimeType.GOOGLE_SHEETS, MimeType.GOOGLE_SLIDES].includes(mime) ? fichier.getAs(MimeType.PDF) : fichier.getBlob();


 const geminiFile = uploadBlobToGeminiFiles_(blob);
 const operation = importFileToStore_(storeName, geminiFile.name);
 waitForOperation_(operation.name);


 const idGemini = geminiFile.name.split('/').pop();
 PropertiesService.getScriptProperties().setProperty(`MAP_${idGemini}`, JSON.stringify({ url: url, titre: nom }));
}


// ==========================================
// 3. UTILITAIRES SYSTÈME
// ==========================================


function uploadBlobToGeminiFiles_(blob) {
 const metadata = { file: { displayName: blob.getName() } };
 const boundary = "xxxxxxxxxx";
 let entete = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n";
 entete += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"file.dat\"\r\nContent-Type: " + blob.getContentType() + "\r\n\r\n";
 const corps = Utilities.newBlob(entete).getBytes().concat(blob.getBytes()).concat(Utilities.newBlob("\r\n--" + boundary + "--").getBytes());
 const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${recupererCleApi()}`, { method: "post", contentType: "multipart/related; boundary=" + boundary, payload: corps, muteHttpExceptions: true });
 if (res.getResponseCode() !== 200) throw new Error(res.getContentText());
 return JSON.parse(res.getContentText()).file;
}


function importFileToStore_(storeName, geminiFileName) {
 return callGeminiApi_(`${storeName}:importFile`, 'post', { fileName: geminiFileName });
}


function waitForOperation_(operationName) {
 let op;
 do {
   Utilities.sleep(2000);
   op = callGeminiApi_(operationName, 'get');
 } while (!op.done);
 if (op.error) throw new Error(`Erreur indexation : ${JSON.stringify(op.error)}`);
 return op;
}


function callGeminiApi_(endpoint, method, payload = null) {
 const url = `${CONFIG.BASE_URL}/${CONFIG.API_VERSION}/${endpoint}?key=${recupererCleApi()}`;
 const options = { method: method, contentType: 'application/json', muteHttpExceptions: true };
 if (payload) options.payload = JSON.stringify(payload);
 const res = UrlFetchApp.fetch(url, options);
 if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) throw new Error(res.getContentText());
 return res.getContentText() ? JSON.parse(res.getContentText()) : {};
}


function enregistrerFeedback(donnees) {
 try {
   SpreadsheetApp.openById(CONFIG.ID_SHEET_LOGS).getSheets()[0].appendRow([new Date(), Session.getActiveUser().getEmail(), donnees.question, donnees.reponse, donnees.estPositif ? "👍" : "👎", donnees.commentaire || ""]);
   return true;
 } catch (e) { return false; }
}


function sauvegarderNiveauExpertise(n) { PropertiesService.getScriptProperties().setProperty(`NIV_${Session.getActiveUser().getEmail()}`, n); }
function recupererNiveauExpertise() { return PropertiesService.getScriptProperties().getProperty(`NIV_${Session.getActiveUser().getEmail()}`) || 'Débutant'; }


function configurerAutomatismeNuit() {
 const declencheurs = ScriptApp.getProjectTriggers();
 declencheurs.forEach(t => {
   if (t.getHandlerFunction() === 'synchroniserBaseConnaissances') ScriptApp.deleteTrigger(t);
 });
 ScriptApp.newTrigger('synchroniserBaseConnaissances').timeBased().everyDays(1).atHour(2).create();
 Logger.log("🚀 Automatisme configuré pour 2h du matin.");
}


function listerMappingActuel() {
 const props = PropertiesService.getScriptProperties().getProperties();
 for (let cle in props) if (cle.startsWith('MAP_')) Logger.log(`${cle} => ${props[cle]}`);
}
