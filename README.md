# Compagnon Digital Workspace


[🇫🇷 Version Française](#-version-française) | [🇬🇧 English Version](#-english-version)

![License MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Platform](https://img.shields.io/badge/Platform-Google%20Apps%20Script-green)
![Runtime](https://img.shields.io/badge/Google%20Apps%20Script-V8-green)
![Author](https://img.shields.io/badge/Auteur-Fabrice%20Faucheux-orange)

## 🇫🇷 Version Française


**Une solution d'assistance intelligente interne pour l'écosystème Google Workspace, utilisant l'architecture RAG (Retrieval-Augmented Generation) via l'API Gemini.**

## 📋 Description

Ce projet est une Web App Google Apps Script (GAS) conçue pour agir comme un mentor technique virtuel au sein de l'entreprise (Cooperl). Il permet aux collaborateurs de poser des questions en langage naturel et d'obtenir des réponses basées sur une base de connaissances documentaire interne stockée sur Google Drive.

### Fonctionnalités clés

* **Moteur IA Gemini (v1beta) :** Utilisation du modèle `gemini-2.5-flash` pour une compréhension contextuelle rapide.
* **RAG (Retrieval-Augmented Generation) :** Indexation dynamique des documents Google Docs, Slides et PDF via les "File Search Stores" de l'API Gemini.
* **Synchronisation Automatique :** Script de maintenance nocturne pour réindexer les documents du dossier Drive source.
* **Interface Utilisateur Moderne :** Web App responsive (HTML5/CSS3) respectant la charte graphique Cooperl, avec rendu Markdown.
* **Feedback Loop :** Système de vote (pouce haut/bas) et commentaires stockés dans Google Sheets pour l'amélioration continue (RLHF).
* **Gestion des Sources :** Citation explicite des documents sources utilisés pour générer la réponse avec liens directs.

## 🛠️ Architecture technique

Le projet se compose de deux parties principales :

1.  **Backend (`Code.js`) :**
    * Gestion des appels API vers `generativelanguage.googleapis.com`.
    * Orchestration de l'upload et de l'indexation des fichiers Drive vers Gemini.
    * Traitement des requêtes utilisateur et gestion du contexte (Expertise utilisateur).
2.  **Frontend (`Index.html`) :**
    * Interface de chat asynchrone (`google.script.run`).
    * Design system personnalisé (CSS Variables).

## 🚀 Installation et configuration

### Prérequis

1.  Un compte Google Workspace.
2.  Un projet Google Cloud Platform (GCP) lié (recommandé) ou l'usage du projet par défaut.
3.  Une **Clé API Gemini** (Google AI Studio).

### Étapes de déploiement

1.  **Création du Script :**
    * Créez un nouveau projet Google Apps Script.
    * Copiez le contenu de `Code.js` et `Index.html`.

2.  **Configuration des Propriétés de Script :**
    Allez dans *Paramètres du projet > Propriétés de script* et ajoutez :
    * `GEMINI_API_KEY` : Votre clé API Google AI Studio.

3.  **Variables de Configuration (`CONFIG` dans `Code.js`) :**
    Modifiez l'objet `CONFIG` au début du script :
    * `ID_DOSSIER_CONNAISSANCES` : ID du dossier Drive contenant vos PDF/Docs.
    * `ID_SHEET_LOGS` : ID d'un Google Sheet pour stocker les feedbacks (avec les colonnes : Date, Email, Question, Réponse, Vote, Commentaire).

4.  **Initialisation de la Base de Connaissances :**
    * Exécutez manuellement la fonction `synchroniserBaseConnaissances()` une première fois depuis l'éditeur pour créer le Store Gemini et indexer les fichiers.

5.  **Déploiement Web App :**
    * Cliquez sur *Déployer > Nouveau déploiement*.
    * Type : *Application Web*.
    * Exécuter en tant que : *Moi*.
    * Qui a accès : *Toute personne de l'organisation*.

## ⚙️ Automatisation

Pour maintenir la base de connaissances à jour, une fonction d'auto-configuration est incluse.
Exécutez la fonction `configurerAutomatismeNuit()` une seule fois. Cela créera un déclencheur (Trigger) qui lancera `synchroniserBaseConnaissances` tous les jours à 2h00 du matin.

## 🛡️ Sécurité et Quotas

* **Confidentialité :** Les données sont traitées via l'API Gemini. Assurez-vous de respecter les politiques de confidentialité de votre organisation concernant l'envoi de données internes à l'API.
* **Quotas :** Surveillez vos quotas API Google AI Studio (RPM/TPM) en fonction du nombre d'utilisateurs.

## 📝 Inspiration

**Stéphane Giron** avec l'article https://medium.com/@stephane.giron/building-a-personalized-ai-tutor-with-gemini-3-nano-banana-pro-and-google-apps-script-4a35e917c6b7?postPublishedType=initial


---
## 🇬🇧 English Version

> English translation coming soon.

---
<p align="center"><a href="https://faucheux.bzh" target="_blank" style="color: inherit; text-decoration: none;">&lt;&gt; par Fabrice Faucheux</a></p>