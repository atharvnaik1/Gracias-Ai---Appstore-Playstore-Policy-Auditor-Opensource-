markdown
# VERCEL Authorization Guide  
**Target Team:** atharvnaik1’s Projects  
**Repository:** ipaship-app-reviewer  
**Pull Request ID:** 102  
**Commit SHA:** 833c0026d1efad5872766cc67c3da1240cbfaede  

---

## 1. Overview  

When a pull request is opened on a repository that is linked to a Vercel project, Vercel requires explicit authorization from the target team before it can create a preview deployment. This document walks a maintainer through the exact steps to grant that authorization for the **atharvnaik1’s Projects** team.

---

## 2. Prerequisites  

| Item | Requirement |
|------|-------------|
| **Vercel Account** | Must be logged in as a user who belongs to the `atharvnaik1’s Projects` team. |
| **GitHub Access** | Must have write access to the `ipaship-app-reviewer` repository (or be an admin of the organization). |
| **Browser** | Any modern browser (Chrome, Edge, Firefox, Safari) with cookies enabled. |
| **Two‑Factor Authentication (2FA)** | If the team enforces 2FA, have the authenticator device ready. |
| **Environment Variables** | `VERCEL_TOKEN` – a personal Vercel API token with `read` and `write` scopes (required for CI/CD pipelines). |

---

## 3. Authorization Flow  

1. **Trigger** – Vercel detects a new commit on the PR and shows a “Deploy” button in the PR comment.  
2. **Redirect** – Clicking the button redirects you to Vercel’s **Git Authorization** page.  
3. **Consent** – You must explicitly consent to Vercel accessing the repository on behalf of the team.  
4. **Result** – After consent, Vercel creates a preview deployment and posts the URL back to the PR.

---

## 4. Step‑by‑Step Instructions  

### 4.1 Generate a Vercel Authentication Token  

1. Log in to the Vercel dashboard: https://vercel.com/dashboard.  
2. Click on your avatar (top‑right) → **Settings** → **Tokens**.  
3. Press **Create Token**.  
4. Give the token a meaningful name, e.g., `ipaship-app-reviewer-ci`.  
5. Ensure the token has **Read** and **Write** scopes (the default scopes are sufficient).  
6. Click **Create** and copy the generated token **immediately** – you will not be able to view it again.

### 4.2 Store the Token as an Environment Variable  

#### For Local Development