# Meadow House Repairs & Maintenance

Repairs, safety checks and certificates for the Meadow House care home, in one place.

- **Care staff** report repairs (with photos), follow progress and confirm when work is done.
- **The maintenance team** books, attends and completes jobs and the home's safety checks, and records certificates.
- **The home manager** approves visit dates, prints room QR codes and downloads inspection evidence.
- **The system administrator** looks after accounts, settings and data.

It runs in any modern browser. It needs no installation, plug-ins or internet connection.

---

## 1. Getting started

1. Open **`login.html`** in Chrome, Edge, Firefox or Safari, or open the web address where the system is hosted (see *Hosting*).
2. Sign in with your **name or email** and the initial password. The administrator gives you the password privately.
3. The first time you sign in you **must choose your own password**:
   - at least 12 characters;
   - include a letter and a number;
   - not your name, your email or common words.

   Three or four random words with a number are easy to remember.

### Accounts

| Name | Email | Role |
|---|---|---|
| Felix Bonsu | sgfbonsu@liverpool.ac.uk | System administrator |
| Jamie O'Brien | sgjobri6@liverpool.ac.uk | Home manager |
| Isha Gaikwad | sgigaikw@liverpool.ac.uk | Care staff |
| Alya Almslem | sgaalmsl@liverpool.ac.uk | Care staff |
| Testimony Gwendolyne | testimonygwendolyne@gmail.com | Maintenance team |
| Ethan Morton | sgemort2@liverpool.ac.uk | Maintenance team |

**Initial password:** shared privately by the system administrator (Felix Bonsu). It is not published in this repository and is not stored in the code: the system keeps only a salted PBKDF2-SHA-256 hash (600,000 iterations) of each password.

### First-day set-up (administrator and manager)

1. **Admin → System & data → Web address:** enter the secure address where staff open the system (it must start with `https://`). This address is used in room QR codes and email alerts.
2. **Admin → System & data → Response targets:** check the target hours. The defaults are:

   | Type of repair | Attend within | Complete within |
   |---|---|---|
   | Resident safety | 4 hours | 24 hours |
   | Urgent | 24 hours | 3 days |
   | Normal | 3 days | 2 weeks |
3. **Manager → Rooms & QR codes:** check the room list, then **Download QR code sheet (PDF)**, print it and put each code up in its room.
4. **Maintenance → Safety checks & testing:** every check starts as **Not recorded**. For each one, select **Record check done**, enter the date of the last check and, where there is one, the certificate details and file. Reminders then start automatically.
5. Ask everyone to select **Alerts → Turn on desktop alerts** on the computers they use.

---

## 2. How to use it

### Care staff (Isha, Alya) – **Repairs**

- **Report a repair:**
  - Describe the problem, check your name and choose **Normal** or **Urgent**.
  - Optionally add where it is, the type of problem and **up to 4 photos**. On a phone or tablet you can use the camera.
  - Tick **This affects resident safety** for anything like a call bell, hoist, bed, hot water, heating, door or trip hazard. These get the fastest response target.
  - Select **Report repair**. The maintenance team is alerted straight away; urgent and safety repairs also alert the manager.
- **Scan a room QR code** with your phone camera to open the report form with the room already filled in.
- **Follow progress:**
  - Each job shows its status (New → Scheduled → In Progress → Completed), who is assigned and the visit date.
  - It also shows the response target (met, missed or overdue), notes, photos, cost and a dated history.
- **Confirm it's fixed:** completed jobs appear under **Please check these repairs**, and you get an alert. Select **Confirm it's fixed**, or **Not fixed** to reopen the job.
- **Announcements:** planned work booked by the manager. Select **I've read this**.

### Maintenance team (Testimony, Ethan) – **Maintenance**

- **Job board:** columns for each status. Urgent and resident-safety jobs come first, and jobs past their target are marked **⏱ Past target**.
- On each job:
  1. **Assign** it.
  2. **Book visit**: the manager then accepts or changes the date.
  3. **Arrived – start work**: records the time you attended. Add a note and **before photos**.
  4. **Complete job**: a completion note is required. Add the **parts and labour costs**, the contractor (if used) and **after photos**. Staff are then asked to confirm.
  5. **Download job report (PDF)**: includes the history, target, cost and photos.
- **Safety checks & testing:** gas, boiler, EICR, PAT, fire alarm, emergency lighting, fire doors, Legionella, TMVs, lifts and hoists (LOLER), bed rails, window restrictors and more.
  - Use **Book a date** and **Record check done**.
  - When recording a check, add the **certificate number, expiry date, engineer or company, registration number (e.g. Gas Safe ID) and the certificate file**.
- **Certificate register:** every certificate with its status: **Valid**, **Expires soon** (within 30 days) or **Expired / Not recorded**.

### Home manager (Jamie) – **Manager**

- **Visit dates:** **Accept** or **Change** dates booked by the maintenance team (a reason is required).
- **Safety checks:** the full schedule; accept or change booked dates.
- **Certificates:** the certificate register with expiry status.
- **Rooms & QR codes:** add or remove rooms and download the printable QR code sheet.
- **Announcements:** **Request maintenance and tell staff**. This books the work and posts a notice. You can see who has read it.
- **Overview & reports:**
  - charts of work done, how quickly repairs were completed, **response targets**, **repair spend** and **recurring issues**;
  - downloads: **PDF report**, **spreadsheet**, and the **Inspection evidence pack (PDF)**. The pack is a ready-made bundle for inspections: summary, safety checks, certificate register, repairs with response times and costs, recurring issues, and planned works notified to staff.

### System administrator (Felix) – **Admin**

- **People & passwords:**
  - **Add a person** (a temporary password is shown once).
  - **Reset password**, **Unlock**, **Change role**, **Disable/Enable** or **Remove** someone.
- **Cover for manager:** give a care worker or maintenance member the manager's access for a set time, up to 14 days, with a reason.
- **Security log:** every sign-in, failure, block and change. Download it as CSV.
- **System & data:**
  - backups and restore;
  - **Sign everyone else out**;
  - **Web address** and **Response targets** settings;
  - **Training data**: example records for staff training. Remove them before going live.

---

## 3. Alerts

The **🔔 Alerts** button at the top of every page shows the alerts meant for you, newest first:

| Alert | Who gets it |
|---|---|
| New repair reported | Maintenance team |
| Urgent or resident-safety repair reported | Maintenance team and manager |
| Visit or safety check date to approve | Manager |
| Visit date accepted or changed | Assigned maintenance person and the person who reported it |
| Job assigned to you | That maintenance person |
| Please check a completed repair | The person who reported it |
| Repair reopened – not fixed | Assigned maintenance person and manager |
| Repair past its attendance or completion target | Manager and assigned person |
| Safety check due within 7 days, or overdue | Maintenance team and manager |
| Certificate expiring within 30 days, or expired | Maintenance team and manager |
| New announcement | Care staff and maintenance team |

How alerts reach people:
- **In the system:** the bell shows the number of unread alerts.
- **Desktop pop-ups:** after you select **Turn on desktop alerts**.
- **Email:** managers and the administrator can select **Email the team** on any alert. This opens a ready-written email to everyone the alert is for, in the computer's email app.

---

## 4. Hosting

The system is a set of static files, so any secure web host works. For example, with **GitHub Pages**:

1. In the repository: **Settings → Pages → Deploy from a branch → `main` / root**.
2. After a minute it is available at `https://fbonsu851.github.io/Meadow-Home-Repairs/login.html`.
3. In **Admin → System & data**, set the web address to `https://fbonsu851.github.io/Meadow-Home-Repairs/`.

Each browser keeps its own records (accounts, repairs, photos), so the home should use the system on its own shared devices. The administrator should download a backup regularly. Moving to a shared server database is the next step for a multi-device rollout (see *Roadmap*).

---

## 5. Who can see what

| | Care staff | Maintenance | Manager | Admin |
|---|:-:|:-:|:-:|:-:|
| Repairs (report, follow, confirm) | ✓ | | ✓ | |
| Maintenance dashboard and certificates | | ✓ | | |
| Manager page (dates, certificates, rooms & QR) | cover only | cover only | ✓ | |
| Announcements | ✓ | ✓ | ✓ (create) | |
| Overview & reports | | ✓ | ✓ (and evidence pack) | |
| Admin | | | | ✓ |

---

## 6. Security

- **Passwords:** salted PBKDF2-SHA-256 hashes only, never stored or published in plain text.
- **New passwords:** forced change at first sign-in and after resets, with a password policy.
- **Lockout:** 5 wrong passwords lock the account for 15 minutes.
- **Least privilege:** role-based access, checked when each page opens and again for every change.
- **Sessions:** each browser tab signs in separately, with a 15-minute idle sign-out.
- **Manager cover:** time-limited and logged.
- **Security log** of sign-ins, failures, blocks and changes.
- **Browser protections:** a strict Content Security Policy (no outside scripts or connections); all text is shown as plain text; spreadsheet exports are protected against formula injection.
- **Photos:** re-encoded when saved, which removes location data from phone pictures.

See [`SECURITY.md`](SECURITY.md) for details and deployment guidance.

---

## 7. Roadmap

1. **Shared server and database:** one live record across all devices, with the security checks enforced on the server.
2. **Organisation sign-in** (Microsoft 365 / Google) with two-factor authentication.
3. **Automatic email and SMS delivery** of alerts through a mail/SMS provider once a server is in place. Alerts and recipients are already worked out by the system.
4. **Offline-capable tablet app** (PWA).
5. **Budgets:** monthly budget versus spend, by type of repair.

---

## Files

| File | Purpose |
|---|---|
| `login.html`, `login.js` | Sign-in (name or email), forced password change |
| `index.html`, `app.js` | Repairs page |
| `maintenance.html`, `dashboard.js` | Maintenance dashboard and certificate register |
| `manager.html`, `manager.js` | Visit dates, safety checks, certificates, rooms & QR codes |
| `announcements.html`, `announcements.js` | Manager requests and staff notices |
| `overview.html`, `overview.js` | Charts, targets, spend, recurring issues, reports, evidence pack |
| `admin.html`, `admin.js` | Accounts, cover, security log, settings, backups |
| `core.js` | Accounts, passwords, sessions, permissions, alerts, targets, costs, certificates, data |
| `ui.js` | Header and alerts, forms, job cards, safety-check rows |
| `media.js` | Photo and certificate file storage, viewer |
| `registers.js` | Certificate register and room QR codes |
| `reports.js` | Charts, PDF reports, evidence pack, CSV |
| `logo-data.js`, `images/` | Logo and sign-in wallpaper |
| `vendor/` | jsPDF, jsPDF-AutoTable and qrcode-generator (MIT licences included) |
