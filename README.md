![iam-role-wizard](./images/iam-role-wizard.png)

# AWS IAM Role Wizard

A browser-based tool that generates AWS IAM role configuration files. Fill out a guided form, click **Generate IAM Role Files**, and receive a complete, commented set of `.tf` or `.json` files ready to hand off to your cloud or DevOps team.

---

## How It Works

The wizard walks you through six steps:

1. **Identity** — Role name, AWS account ID, owner and cost-center tags, description, optional permission boundary, and IAM role path
2. **Trust** — Principal type (AWS service, IAM user/role, cross-account, OIDC, or SAML) and the specific principals allowed to assume the role
3. **Permissions** — AWS managed policy presets, a per-service inline policy builder with Read / Read-Write / Admin access levels, and optional resource-level scoping
4. **Conditions** — Security guardrails: MFA requirement, IP allowlisting, SSL enforcement, region restriction, session duration, role chaining policy, and explicit deny statements
5. **Advanced** — Output format (Terraform HCL or JSON), instance profile generation, separate policy resource, CloudWatch alarm, and extra tags or locals
6. **Review** — A summary of all selected options before generation

On submit, the configuration is routed to the most appropriate Claude model: simple roles using managed policies and basic service trust go to Claude Haiku for faster turnaround, while complex configurations involving inline policies, OIDC or SAML trust, cross-account access, deny rules, or resource-level scoping are sent to Claude Sonnet for stronger reasoning on nuanced IAM logic. The generated output is displayed in named file panels with one-click copy buttons and a **Download ZIP** button to grab all files at once.

---

## Prerequisites

- A [Vercel account](https://vercel.com/signup) (free tier is sufficient)
- An [Anthropic API key](https://console.anthropic.com/)
- [Node.js](https://nodejs.org/) installed locally
- [Git](https://git-scm.com/) installed locally

---

## Deploying to Vercel

### 1. Clone and prepare

```bash
git clone <your-repo-url>
cd <repo-directory>
```

### 2. Deploy

```bash
npm install -g vercel
vercel deploy --prod
```

### 3. Set the API key environment variable

The serverless function at `api/generate.js` requires `ANTHROPIC_API_KEY` to be set. Add it via the Vercel CLI:

```bash
vercel env add ANTHROPIC_API_KEY
```

Or in the Vercel dashboard: **Project → Settings → Environment Variables**.

Add your Anthropic API key from [console.anthropic.com](https://console.anthropic.com/). The key is never exposed to the browser — all Anthropic API calls are proxied through the serverless function.

### 4.Redeploy to apply the environment variable

```bash
vercel deploy --prod
```

---

## Project Structure

```
.
├── public/
│   └── index.html        # Single-page frontend (no build step)
├── api/
│   └── generate.js       # Vercel serverless function — Anthropic API proxy
└── vercel.json           # Routing config
```

---

## Generated Output

The wizard produces IAM role files following AWS security best practices — no wildcard actions unless explicitly requested, no hardcoded sensitive values, and inline comments throughout so your team can review before applying.

### Terraform output (`terraform` mode)


| File           | Contents                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `iam_role.tf`  | `aws_iam_role`, inline policy, managed policy attachments, instance profile, and optional CloudWatch alarm |
| `variables.tf` | Configurable values: account ID, role name, trusted principals, tags, etc.                                 |
| `outputs.tf`   | Role ARN, role name, and instance profile ARN (if applicable)                                              |


### JSON output (`json` mode)


| File                     | Contents                               |
| ------------------------ | -------------------------------------- |
| `trust_policy.json`      | IAM trust relationship policy document |
| `permission_policy.json` | IAM permission policy document         |


All files are available individually via the one-click **Copy** button on each panel, or bundled together using the **Download ZIP** button.

---

## Security Notes

- **API key isolation** — `ANTHROPIC_API_KEY` lives only in Vercel's environment; the browser never sees it.
- **IP restriction** — To limit access to your corporate network or VPN, add an IP allowlist in your Vercel project settings or via a middleware function.
- **Rate limiting** — Vercel's Edge Middleware can be used to add per-IP rate limiting if you want to cap API usage for internal deployments.

---

## Setting Up Rate Limiting (Vercel KV)

The API route uses **Vercel KV** (serverless Redis) to enforce a cooldown per IP address between generation requests. Without it, anyone who discovers your URL could run up your Anthropic bill.

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

The rate limiter is now active. Each IP can generate once per cooldown window. If they try sooner, they will see a message telling them exactly how many seconds to wait.

> **Note:** If KV is unavailable for any reason, the function fails open — requests go through rather than being blocked. This prevents an outage in KV from taking down the whole tool.

### Changing the Rate Limit Window

The cooldown duration is controlled by a single constant in `api/generate.js`. Open the file and look for this block near the top:

```javascript
const RATE_LIMIT_SECONDS = 120; // 2-minute cooldown per IP
```

Change the value to whatever fits your usage needs:


| Value  | Cooldown            |
| ------ | ------------------- |
| `60`   | 1 minute            |
| `120`  | 2 minutes (default) |
| `3600` | 1 hour              |


After editing, redeploy for the change to take effect:

```bash
vercel deploy --prod
```

### Changing What Gets Rate Limited

By default, the rate limit is applied per IP address. If you want to change the granularity — for example, to apply a single shared limit across all users rather than per IP — find this line in `api/generate.js`:

```javascript
const rateLimitKey = `rl:${clientIp}`;
```

You can replace `clientIp` with any fixed string to create a global limit shared by all users:

```javascript
const rateLimitKey = `rl:global`;
```

Or scope it per user if your deployment adds an authentication header:

```javascript
const rateLimitKey = `rl:${request.headers.get('x-user-id') || clientIp}`;
```

### Viewing and Clearing Rate Limit State

If you need to manually clear a rate limit — for example, during testing or if a legitimate user is incorrectly blocked — you can do so directly from the Vercel KV dashboard:

1. Go to **Storage** in your Vercel dashboard and select your KV store
2. Click **Data Browser**
3. Keys are stored in the format `rl:<ip-address>` (e.g. `rl:203.0.113.42`)
4. Select the key and click **Delete** to immediately clear the cooldown for that IP

You can also flush all rate limit keys at once using the Vercel KV CLI:

```bash
vercel kv keys 'rl:*' | xargs -I{} vercel kv del {}
```

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
