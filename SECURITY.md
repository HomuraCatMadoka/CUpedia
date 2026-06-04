# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, report them privately through GitHub Security Advisories:

1. Go to the [Security tab](https://github.com/HomuraCatMadoka/CUpedia/security)
   of the repository.
2. Click **Report a vulnerability**.
3. Describe the issue, including steps to reproduce, affected area
   (auth, wiki, uploads, admin, etc.), and impact.

This keeps the report confidential and lets us coordinate a fix and disclosure
with you privately. You should receive an initial response within a few days.

Please give us a reasonable window to address the issue before any public
disclosure.

## Supported Versions

CUpedia is an actively developed application, not a versioned library. Security
fixes are applied to the latest `main` branch and the deployed instance. There
are no maintained older releases.

## Scope

In scope: the application code in this repository (authentication and access
control, wiki content mutations, file upload / asset access, admin actions).

Out of scope: vulnerabilities in third-party dependencies or hosting providers
(report those upstream), and issues that require an already-compromised account
or privileged local access.
