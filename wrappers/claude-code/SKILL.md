---
name: ipaship-appstore-compliance-auditor
description: Use when auditing iOS/Android app submissions for compliance with Apple App Store Review Guidelines or Google Play Developer Policies. Scan .ipa, .apk, or .zip files against official store policies, generate structured compliance reports, and identify violations with remediation steps.
tags: [app-store, compliance, audit, ios, android, apple, google-play, app-review]
---

# ipaShip — App Store Compliance Auditor

Audit your iOS/Android app packages against official store policies before submission. Upload `.ipa` or `.apk` files and get a structured compliance report with guideline references, severity ratings, and actionable fixes.

## When to Use

- Before submitting an iOS app to the **Apple App Store** — catch rejections early
- Before submitting an Android app to **Google Play** — identify policy violations
- During CI/CD to automate pre-submission compliance checks
- When reviewing third-party apps for compliance risks
- As part of a code review workflow for mobile apps

## Setup

### Prerequisites

| Requirement | Details |
|-------------|---------|
| Account | [ipaship.com](https://ipaship.com) — free to use |
| API Key | Get yours at [ipaship.com](https://ipaship.com) |
| App Package | `.ipa` (iOS), `.apk` (Android), or `.zip` file (max 150MB) |
| Dependencies | The server needs `unzip` installed |

### Environment Variables

```bash
export IPASHIP_API_KEY="your-api-key-here"
```

## Usage

### 1. Web Interface (No Code Required)

1. Go to [ipaship.com](https://ipaship.com)
2. Upload your `.ipa` or `.apk` file
3. Select your AI provider (Claude, GPT, Gemini, or OpenRouter)
4. Click "Audit" and wait for the streaming report

### 2. CLI via cURL

```bash
# Basic audit with default provider (Anthropic Claude)
curl -X POST https://ipaship.com/api/audit \
  -H "Authorization: Bearer $IPASHIP_API_KEY" \
  -F "file=@/path/to/your-app.ipa" \
  -F "provider=anthropic" \
  -F "model=claude-3-5-sonnet-20241022"

# With context about your app
curl -X POST https://ipaship.com/api/audit \
  -H "Authorization: Bearer $IPASHIP_API_KEY" \
  -F "file=@/path/to/your-app.ipa" \
  -F "provider=anthropic" \
  -F "model=claude-3-5-sonnet-20241022" \
  -F "context=This is a social media app with user-generated content"

# Using OpenAI
curl -X POST https://ipaship.com/api/audit \
  -H "Authorization: Bearer $IPASHIP_API_KEY" \
  -F "file=@/path/to/your-app.apk" \
  -F "provider=openai" \
  -F "model=gpt-4o"
```

### 3. Python Wrapper

```python
# wrappers/python/ipaship.py
from ipaship import audit_app

result = audit_app(
    file_path="build/YourApp.ipa",
    provider="anthropic",
    model="claude-3-5-sonnet-20241022",
    api_key="your-key"
)
print(result)
```

### 4. Programmatic — All Language Wrappers

The repo ships wrappers in 15+ languages under `wrappers/`:

| Language | Path | Status |
|----------|------|--------|
| Python | `wrappers/python/ipaship.py` | ✅ |
| Node.js | `wrappers/npm/index.js` | ✅ |
| Go | `wrappers/go/ipaship.go` | ✅ |
| Rust | `wrappers/rust/src/main.rs` | ✅ |
| Ruby | `wrappers/ruby/lib/ipaship.rb` | ✅ |
| Java | `wrappers/java/` | ✅ |
| Kotlin | `wrappers/kotlin/` | ✅ |
| Swift | `wrappers/swift-cocoapods/` | ✅ |
| Flutter/Dart | `wrappers/flutter-dart/` | ✅ |
| PHP | `wrappers/php/` | ✅ |
| C++ | `wrappers/cpp/` | ✅ |
| C# (.NET) | `wrappers/csharp-dotnet/` | ✅ |
| R | `wrappers/r/` | ✅ |
| Expo | `wrappers/expo/` | ✅ |
| Homebrew | `wrappers/homebrew/` | ✅ |

## Features

### Supported AI Providers

| Provider | Models |
|----------|--------|
| **Anthropic** | Claude Sonnet 4, Claude 3.5 Sonnet, Claude 3 Opus |
| **OpenAI** | GPT-4o, GPT-4o-mini |
| **Google Gemini** | Gemini 2.5 Flash, Gemini 2.0 Pro |
| **OpenRouter** | Any model (e.g., `anthropic/claude-3.5-sonnet`) |
| **ipaShip (NVIDIA)** | Llama 3.1 405B, NVIDIA NIM models |

### Audit Report Structure

Every report includes:

1. **Executive Summary** — What the app does (from code analysis)
2. **Dashboard** — Risk level (LOW/MEDIUM/HIGH), readiness score, issue counts
3. **Phase 1: Policy Compliance** — Per-guideline checks with PASS/WARN/FAIL
4. **Phase 2: Remediation Plan** — Prioritized fix table with file references
5. **Submission Readiness** — Go/no-go verdict with score

### Key Capabilities

- **Multi-provider AI** — Choose your preferred LLM backend
- **Real-time streaming** — Watch the audit generate live
- **IPA & APK support** — Both iOS and Android
- **Export** — Download as Markdown or PDF
- **Zero-trust** — Files deleted after analysis, API keys stay client-side
- **Rate limited** — 5 requests/minute per client (DDoS protection)

## Common Pitfalls

1. **Forgetting `unzip`** — The server needs `unzip` installed to extract packages. If you see extraction errors, install it: `sudo apt-get install unzip`.
2. **File too large** — Maximum upload size is 150MB. For larger apps, trim the .ipa/.apk first.
3. **No source files found** — Ensure your app package isn't encrypted or DRM-protected. The auditor only analyzes readable source code (`.swift`, `.java`, `.kt`, etc.).
4. **API key in the wrong place** — The server uses `NVIDIA_KEY` or `NEXT_PUBLIC_API_KEY` env vars for the backend. For BYOK (bring your own key), pass it in the upload form.
5. **Binary-only apps** — Apps compiled without source code (e.g., Unity builds with only IL2CPP binaries) will have few files to analyze. The audit quality depends on available source.

## Verification

After setting up:

1. Deploy the app locally: `npm run dev`
2. Upload a test `.ipa` or use the cURL command above
3. Verify you get a streaming JSON response starting with `{"type":"meta","filesScanned":N}`
4. Check that the final report includes both Phase 1 (compliance checks) and Phase 2 (remediation plan)
5. Test with different providers by changing the `provider` field

## References

- [ipaShip Website](https://ipaship.com)
- [GitHub Repository](https://github.com/atharvnaik1/ipaship-app-reviewer)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Developer Policy](https://play.google.com/about/developer-content-policy/)
