# Stockage des scénarios avec Supabase

Le site utilise [Supabase](https://supabase.com) (offre gratuite) pour permettre aux
utilisateurs de se connecter **avec leur compte Google uniquement** et d'enregistrer
leurs scénarios dans le cloud.

## 1. Créer le projet Supabase (~5 minutes)

1. Allez sur https://supabase.com → **Start your project** → connectez-vous avec GitHub.
2. **New project** : nom `scenariste`, mot de passe de base de données généré
   (conservez-le quelque part, il ne sert pas au site), région **Europe (Paris ou
   Francfort)**. Attendez ~2 minutes le provisionnement.
3. Dans le menu de gauche : **SQL Editor** → collez le script ci-dessous → **Run**.
4. **Project Settings → API Keys** : copiez l'**URL du projet** (`https://xxxx.supabase.co`)
   et la clé **anon public**, puis renseignez-les dans `src/config.ts`.

## 1 bis. Activer la connexion Google (~10 minutes)

Supabase demande vos propres identifiants OAuth Google (gratuits) :

1. Dans Supabase : **Authentication → Sign In / Up → Google** — notez l'URL de
   **Callback** affichée (`https://xxxx.supabase.co/auth/v1/callback`).
2. Sur https://console.cloud.google.com : créez un projet (`scenariste`), puis
   **API et services → Écran de consentement OAuth** : type **Externe**, nom de
   l'application, votre e-mail ; publiez l'application (sinon seuls les comptes de
   test pourront se connecter).
3. **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   type **Application Web** ; dans **URI de redirection autorisés**, collez l'URL de
   callback Supabase de l'étape 1.
4. Copiez le **Client ID** et le **Client secret** dans Supabase
   (Authentication → Sign In / Up → Google), activez le fournisseur et enregistrez.
   Désactivez le fournisseur **Email** pour n'autoriser que Google.
5. **Authentication → URL Configuration** : *Site URL* =
   `https://jacques-dev.github.io/scenariste/` ; dans *Redirect URLs*, ajoutez
   `http://localhost:5173` (pour le développement local).

La clé *anon public* est conçue pour être publiée dans le code du site : la sécurité
repose sur les règles RLS ci-dessous, qui garantissent que chaque utilisateur ne peut
lire, modifier et supprimer que ses propres lignes.

## 2. Script SQL (table + sécurité)

```sql
-- Table des scénarios
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Sans titre',
  content text not null default '',
  updated_at timestamptz not null default now()
);

-- Sécurité : chaque utilisateur ne voit que ses scénarios
alter table public.scenarios enable row level security;

create policy "proprietaire uniquement"
  on public.scenarios
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index scenarios_user_updated on public.scenarios (user_id, updated_at desc);
```

## 3. Fonctionnement côté site

- `src/config.ts` — URL + clé anon. Vides → les boutons de compte n'apparaissent pas,
  le site fonctionne comme avant (export fichier uniquement).
- `src/supabase.ts` — client, connexion Google (OAuth) et opérations
  (enregistrer, lister, supprimer).
- `src/components/Cloud.tsx` — dialogue « Mes scénarios ».
- Raccourci **Ctrl+S** : enregistre le scénario courant quand on est connecté.

## Limites de l'offre gratuite

500 Mo de base de données (≈ plusieurs milliers de scénarios), 50 000 utilisateurs
authentifiés actifs/mois, pause automatique du projet après ~1 semaine sans activité
(réactivation en un clic depuis le tableau de bord supabase.com).
