# Security notes

## What the app does

| Area | Measure |
|---|---|
| Passwords | PBKDF2-SHA-256, 600,000 iterations, random 16-byte salt per account, constant-time comparison. No plain-text passwords in code or storage. |
| First sign-in | Every seeded, new or reset account must set its own password before it can use the app. |
| Password policy | At least 12 characters, a letter and a number, no name or email, no common words, cannot reuse the temporary password. |
| Brute force | 5 wrong passwords lock the account for 15 minutes; the administrator can unlock it. All attempts are logged. |
| Access control | Role-based, least privilege. Pages are checked before they render; every data change is re-checked against a permission table. The role is read from the account record, not the session. |
| Elevation | Admin-granted, time-limited (max 14 days) manager cover with a reason; ends automatically; logged. |
| Sessions | Per-tab session token (sessionStorage); 15-minute idle timeout; 12-hour maximum; ended everywhere on password reset, role change, disable or removal. |
| Audit | Security log (last 1,000 events) of sign-ins, failures, lockouts, blocked pages/actions, account changes, cover, downloads, backups. |
| Browser | Content Security Policy (`script-src 'self'`, `connect-src 'none'`, no inline scripts), `no-referrer`, all user text rendered with `textContent`. |
| Exports | CSV cells are protected against formula injection; backups exclude accounts and password hashes. |

## Known limits

This is a static, browser-only application. All data, including password hashes, lives in the browser's local storage. Anyone with full control of the browser profile can read or alter it, so the controls above protect against casual misuse and mistakes, not against a determined attacker on the same device.

Before holding real residents' or staff information:

1. Move authentication, permission checks and storage to a server (HTTPS, server-side sessions in HTTP-only cookies, a database with backups).
2. Use the organisation's identity provider (single sign-on) with multi-factor authentication.
3. Complete a data protection impact assessment (DPIA) and agree retention periods for records and logs.

## Reporting a problem

Please report security concerns privately to the system administrator rather than opening a public issue.
