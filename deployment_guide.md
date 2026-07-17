# SignFlow — Deployment Guide

This guide explains how to deploy the **SignFlow** digital signature platform using **GitHub**, **Vercel** (for the React Frontend), and **Render** (for the Node.js/Express Backend).

---

## 1. Push Code to GitHub

First, you need to push the initialized Git repository to your GitHub account:

1. Create a new empty repository on GitHub (e.g., named `signflow`).
2. Run the following commands in your local workspace terminal:
   ```bash
   # Add your GitHub repository as remote (replace with your actual repository URL)
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/signflow.git

   # Rename branch to main if not already
   git branch -M main

   # Push code to GitHub
   git push -u origin main
   ```

---

## 2. Deploy Backend on Render

Render will host the Node.js Express server. Since we committed a `render.yaml` blueprint, Render can automatically configure the service for you!

### Step-by-step:
1. Log in to the [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** and select **Blueprint**.
3. Connect your GitHub account and select your `signflow` repository.
4. Render will parse `render.yaml` and prompt you to enter the environment variables (see below).
5. Give your blueprint group a name (e.g., `signflow-stack`) and click **Apply**.

### Environment Variables to Configure on Render:
| Variable Name | Description / Value |
|---|---|
| `MONGODB_URI` | Your MongoDB Atlas connection string (e.g., `mongodb+srv://...`) |
| `JWT_ACCESS_SECRET` | A secure random string for signing access tokens |
| `JWT_REFRESH_SECRET` | A secure random string for signing refresh tokens |
| `FRONTEND_URL` | The live Vercel URL of your frontend (e.g., `https://signflow.vercel.app`) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase Service Role Key (needed for secure backend bucket access) |
| `NODE_ENV` | Set to `production` |

*Note: Once deployed, Render will provide a live service URL. The current live backend is at `https://signflow-x49g.onrender.com`.*

---

## 3. Deploy Frontend on Vercel

Vercel will host the React frontend. Vercel automatically detects Vite apps and configures the build settings.

### Step-by-step:
1. Log in to the [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New** → **Project**.
3. Import your `signflow` GitHub repository.
4. Set the configuration details:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
5. Expand **Environment Variables** and add the following variable:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://signflow-x49g.onrender.com/api` (live Render backend URL)
6. Click **Deploy**.

Vercel will build the frontend, apply the client-side SPA routing rules defined in `frontend/vercel.json`, and output a live public URL: **`https://signflow-ten-phi.vercel.app`**.

---

## 4. Final Handshake (CORS Configuration)

Once both frontend and backend are live:
1. Go to your **Render Dashboard** → select your backend service.
2. Go to **Environment**.
3. Update the `FRONTEND_URL` variable to `https://signflow-ten-phi.vercel.app` (no trailing slash).
4. Save changes. Render will automatically trigger a re-deploy with the new CORS settings.

---

## Verification

To verify your live deployment:
- Access the live frontend at **https://signflow-ten-phi.vercel.app**.
- The backend API is live at **https://signflow-x49g.onrender.com**.
- Sign up and log in.
- Try uploading a PDF, placing a signature field, sharing the signing link, signing the document via the public link, and checking the audit trail to confirm that everything is connected.
