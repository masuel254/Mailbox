# Installation du relais MailBox (V2), pas à pas

Durée : 15 à 20 minutes, devant un PC. n8n n'est pas modifié.

À avoir sous la main :
- l'accès SSH au VPS OVH (identifiant et mot de passe ou clé reçus d'OVH) ;
- le **code secret du client** Google (console Google › Google Auth Platform › Clients › MailBox Iphone) ;
- l'adresse et le mot de passe de la messagerie Free.

## Étape 1 : Google, ajouter l'adresse de retour du relais

console.cloud.google.com › projet **MailBox** › Google Auth Platform › **Clients** › « Mail box Iphone » :
- **URI de redirection autorisés** › Ajouter : `https://vps-444b360b.vps.ovh.net/mailbox/auth/google/callback`
- garder l'URI existant `https://masuel254.github.io/Mailbox/`
- Enregistrer. Copier au passage le **code secret du client**.

## Étape 2 : Google, passer l'appli en production

Sinon la connexion permanente est coupée tous les 7 jours.

Google Auth Platform › **Audience** › **Publier l'application** › Confirmer.
Si Google demande de compléter la page de branding : renseigner l'adresse de la page d'accueil `https://masuel254.github.io/Mailbox/` puis recommencer.

## Étape 3 : installer le relais sur le VPS

Depuis le PC : ouvrir un terminal (Windows : PowerShell) et se connecter :

```
ssh ubuntu@vps-444b360b.vps.ovh.net
```

(remplacer `ubuntu` par l'identifiant fourni par OVH si différent)

Puis coller cette commande unique :

```
curl -fsSL https://raw.githubusercontent.com/masuel254/Mailbox/main/relay/install.sh | sudo bash
```

Le script pose 3 questions :
1. Adresse du VPS : appuyer sur Entrée (valeur proposée).
2. ID client Google : appuyer sur Entrée (valeur proposée).
3. Code secret du client : le coller (il ne s'affiche pas), puis Entrée.

À la fin, il affiche un encadré **À RECOPIER** avec l'adresse du relais et le **code d'accès**. Garder ce code.

Le script sauvegarde le Caddyfile avant modification et le restaure si Caddy refuse la nouvelle configuration.

## Étape 4 : dans l'appli MailBox (sur l'iPhone, ouverte depuis l'icône)

1. Réglages › **Serveur relais** : l'adresse est préremplie, coller le **code d'accès**, puis **Connecter le relais**.
2. **Relier Gmail** › compte Google › Continuer › tout autoriser. Retour automatique dans l'appli : « Gmail relié au relais ».
3. **Notifications et pastille** › **Activer** › Autoriser. Puis **Tester** : une notification doit arriver.
4. Carte **Free** (en haut des Réglages) : adresse Free, mot de passe, **Tester et enregistrer**.

Dans Réception apparaissent alors les onglets **Tous / Gmail / Free**.

## En cas de souci

- Vérifier que le relais tourne : `sudo docker logs --tail 30 mailbox-relay`
- Le relais répond-il ? `curl https://vps-444b360b.vps.ovh.net/mailbox/health`
- Mettre à jour le relais plus tard : relancer la même commande curl.
- Revenir en arrière côté Caddy : le fichier de sauvegarde `Caddyfile.avant-mailbox-…` est à côté du Caddyfile.
