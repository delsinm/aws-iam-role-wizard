# Deploying AWS IAM Role Wizard to Vercel

This guide walks through hosting the AWS IAM Role Wizard on Vercel. The wizard uses a serverless API route to proxy requests to Anthropic, so your API key is never exposed in the browser.

---

## Prerequisites

- A [Vercel account](https://vercel.com/signup) (free tier works fine)
- An [Anthropic API key](https://console.anthropic.com/)
- [Node.js](https://nodejs.org/) installed locally
- [Git](https://git-scm.com/) installed locally

---

## Project Structure

```
iam-role-wizard/
├── api/
│   └── generate.js      # Serverless function — proxies requests to Anthropic
├── public/
│   └── index.html       # The wizard UI
├── package.json
└── vercel.json          # Routing config
```

The key security detail: `index.html` calls `/api/generate` on your own domain. The serverless function adds the Anthropic API key server-side before forwarding to Anthropic. Your key is stored in Vercel's environment variables and never reaches the browser.

---

## Option A — Deploy via Vercel CLI (recommended)

**1. Install the Vercel CLI**

```bash
npm install -g vercel
```

**2. Clone or download the project**

Place the project files in a folder on your machine, maintaining the structure above.

**3. Log in to Vercel**

```bash
vercel login
```

**4. Deploy**

From inside the `iam-wizard` folder:

```bash
vercel deploy --prod
```

Follow the prompts — when asked about the project name, framework, and build settings, the defaults are all correct. Vercel will detect the `public/` directory and `api/` functions automatically.

**5. Add your Anthropic API key**

After the first deploy, go to your [Vercel dashboard](https://vercel.com/dashboard):

1. Select your project
2. Go to **Settings** → **Environment Variables**
3. Add a new variable:
  - **Name:** `ANTHROPIC_API_KEY`
  - **Value:** `sk-ant-...` (your key from [console.anthropic.com](https://console.anthropic.com/))
  - **Environment:** Production (and Preview if you want)
4. Click **Save**

**6. Redeploy to apply the environment variable**

```bash
vercel deploy --prod
```

Your wizard is now live at the URL Vercel provides (e.g. `https://iam-wizard-yourname.vercel.app`).

---

## Option B — Deploy via GitHub

**1. Push the project to a GitHub repository**

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/iam-wizard.git
git push -u origin main
```

**2. Import the repository into Vercel**

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and select your repo
3. Leave all build settings as defaults — Vercel will detect the configuration automatically
4. Click **Deploy**

**3. Add your Anthropic API key**

Same as Step 5 above — go to **Settings** → **Environment Variables** in your Vercel project dashboard.

Every subsequent `git push` to `main` will trigger an automatic redeployment.

---

## Verifying It Works

Once deployed, open your Vercel URL and:

1. Fill out the wizard steps
2. On Step 6 (Review & Generate), click **Generate IAM Role Files**
3. The results page should appear after 15–60 seconds with separate boxes for each generated file

If you see an error, check **Vercel** → **your project** → **Deployments** → select the latest → **Functions** tab for logs.

---

## Troubleshooting

**"API key not configured" error**  
The `ANTHROPIC_API_KEY` environment variable is missing or not yet applied. Make sure you added it in Vercel's dashboard and redeployed afterward.

**CORS or 401 errors in browser console**  
The wizard should only be calling `/api/generate` (your own domain), not `api.anthropic.com` directly. If you see direct calls to Anthropic, you may be running an older version of `index.html` — re-download and redeploy.

**Deployment times out**  
Vercel's timeout limits depend on your plan and whether **Fluid Compute** is enabled (it is by default on new projects):


| Plan         | Without Fluid Compute | With Fluid Compute |
| ------------ | --------------------- | ------------------ |
| Hobby (free) | 10s                   | 300s (5 min)       |
| Pro ($20/mo) | 60s                   | 800s (13 min)      |


Since generation waits on Anthropic's API — and Vercel does not count I/O wait time toward your active CPU usage — **the free Hobby plan with Fluid Compute is sufficient** for this use case.

If you're on an older project without Fluid Compute, enable it in your Vercel project under **Settings → Functions → Fluid Compute**, or explicitly set the timeout in `vercel.json`:

```json
{
  "functions": {
    "api/generate.js": {
      "maxDuration": 120
    }
  }
}
```

**Generation returns empty or partial files**  
This is usually the model hitting `max_tokens`. The current limit is set to `8000` tokens in `api/generate.js`. For very complex role configurations, you can increase this — but note that higher token counts cost more and take longer.

---

## Setting Up Rate Limiting (Vercel KV)

The API route uses **Vercel KV** (serverless Redis) to enforce a 2-minute cooldown per IP address. Without it, anyone who discovers your URL could run up your Anthropic bill.

**1. Create a KV store**

In your Vercel dashboard:

1. Go to **Storage** → **Create Database** → **KV**
2. Give it a name (e.g. `iam-wizard-kv`) and click **Create**
3. On the next screen, click **Connect to Project** and select your project

Vercel will automatically add the required environment variables (`KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`) to your project.

**2. Redeploy**

```bash
vercel deploy --prod
```

That's it. The rate limiter is now active. Each IP can generate once every 2 minutes. If they try sooner, they'll see a message telling them exactly how many seconds to wait.

> **Note:** If KV is unavailable for any reason, the function fails open — requests go through rather than being blocked. This prevents an outage in KV from taking down the whole tool.

---

## Restricting Access to Specific IP Ranges

By default, your deployed Vercel URL is publicly accessible to anyone on the internet. If this tool is intended for internal use only, you should restrict access to your corporate IP range or VPN egress IPs. There are two ways to do this depending on your Vercel plan.

### Option A — Vercel Firewall (Pro plan and above)

Vercel's built-in firewall lets you allowlist IP ranges directly from the dashboard with no code changes required. This is the cleanest option if your team is already on a paid Vercel plan.

1. Go to your [Vercel dashboard](https://vercel.com/dashboard) and select your project
2. Navigate to **Settings** → **Security** → **Firewall**
3. Under **IP Blocking**, click **Add Rule**
4. Set the action to **Allow** and enter your corporate IP range in CIDR notation (e.g. `203.0.113.0/24`)
5. Add a second rule to **Block** all other traffic (`0.0.0.0/0`)
6. Save and verify access from inside and outside your network

> **Note:** CIDR notation expresses an IP range as a base address plus a prefix length — for example, `203.0.113.0/24` covers all addresses from `203.0.113.0` to `203.0.113.255`. Your network team can provide the correct CIDR block for your office or VPN egress IP. If your organization uses multiple egress IPs or a VPN, you may need to add more than one Allow rule.

### Option B — Middleware IP Check (all plans, including free Hobby)

If you are on the free Hobby plan, Vercel's firewall is not available. Instead, you can enforce IP restrictions in code by adding a `middleware.js` file to the project root. This runs on every incoming request before it reaches the app.

Create a file called `middleware.js` in the project root with the following content, replacing the example ranges with your own:

```javascript
import { NextResponse } from 'next/server';

const ALLOWED_CIDRS = [
  '203.0.113.0/24',   // Office network — replace with your range
  '198.51.100.42/32', // VPN egress IP — replace with your IP
];

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function inCidr(ip, cidr) {
  const [base, bits] = cidr.split('/');
  const mask = bits === '32' ? 0xFFFFFFFF : (~0 << (32 - parseInt(bits, 10))) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask);
}

export function middleware(request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0';

  const allowed = ALLOWED_CIDRS.some(cidr => inCidr(ip, cidr));

  if (!allowed) {
    return new NextResponse('Access denied.', { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
```

After adding this file, redeploy:

```bash
vercel deploy --prod
```

Requests from outside the allowed ranges will receive a `403 Access denied` response. You can customize that message or redirect to an internal page if preferred.

> **Important:** The middleware approach relies on the `x-forwarded-for` header to identify the client IP. This header is set by Vercel's edge network and is reliable in this context, but it should not be treated as a hard security boundary on its own. For highly sensitive deployments, combine this with the Vercel firewall (Option A) or place the app behind a corporate VPN or reverse proxy that handles authentication independently.

### Which Option Should You Use?


| Scenario                    | Recommendation                                                                   |
| --------------------------- | -------------------------------------------------------------------------------- |
| On Vercel Pro or Enterprise | Use the Vercel Firewall (Option A) — no code changes, managed from the dashboard |
| On free Hobby plan          | Use the middleware approach (Option B)                                           |
| High-security environment   | Use both, or place the app behind a VPN/reverse proxy                            |


---

## Environment Variables Reference


| Variable            | Required                | Source           | Description                                       |
| ------------------- | ----------------------- | ---------------- | ------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Yes                     | Manual           | Your Anthropic API key from console.anthropic.com |
| `KV_REST_API_URL`   | Yes (for rate limiting) | Auto (Vercel KV) | KV store REST endpoint                            |
| `KV_REST_API_TOKEN` | Yes (for rate limiting) | Auto (Vercel KV) | KV store auth token                               |


---

## Cost Considerations

Each generation call uses Claude Sonnet and typically consumes 3,000–8,000 output tokens depending on configuration complexity. Check [Anthropic's pricing page](https://www.anthropic.com/pricing) for current rates. For light internal use, costs are minimal — typically a few cents per generation.