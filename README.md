# Meadow House Repairs

A browser app for the Meadow House care home. Staff report repairs and follow them to completion. The maintenance team books, attends and completes the work and the home's safety checks. The home manager approves visit dates and keeps an overview. A system administrator looks after accounts and data.

It needs no installation, account system, paid service or internet connection: everything runs in the browser.

---

## 1. Getting started

1. Download or clone this repository.
2. Open **`login.html`** in Chrome, Edge, Firefox or Safari (double-click it). You can also run a small web server in the folder (`npx serve .`) and open the address it shows.
3. Sign in with your **name or email** and the initial password (the administrator gives it to you privately).
4. The first time you sign in, you **must choose your own password**. After that, the initial password no longer works for your account.

> Records are kept in the browser you use (local storage). Each computer or browser has its own copy of the data. The administrator should download a backup regularly (Admin → System & data).

### Accounts

| Name | Email | Role |
|---|---|---|
| Felix Bonsu | sgfbonsu@liverpool.ac.uk | System administrator |
| Jamie O'Brien | sgjobri6@liverpool.ac.uk | Home manager |
| Isha Gaikwad | sgigaikw@liverpool.ac.uk | Care staff |
| Alya Almslem | sgaalmsl@liverpool.ac.uk | Care staff |
| Testimony Gwendolyne | testimonygwendolyne@gmail.com | Maintenance team |
| Ethan Morton | sgemort2@liverpool.ac.uk | Maintenance team |

**Initial password:** shared privately with each team member by the system administrator (Felix Bonsu). For security it is not published in this public repository.

The password is not stored in the code either. The app holds only a salted PBKDF2-SHA-256 hash (600,000 iterations) for each account. Everyone must replace the initial password at first sign-in. If you open a fresh copy of the app in a new browser, the accounts start again with the initial password, so sign in and change it straight away.

New passwords must:
- have at least 12 characters, including a letter and a number;
- not contain your name or email;
- not use common words such as "password".

Three or four random words with a number are easy to remember, for example `copper kettle 4 tea`.

---

## 2. How to use it

### Care staff (Isha, Alya) – page: **Repairs**

- **Report a repair:** describe the problem, check your name, choose **Normal** or **Urgent**, then select **Report repair**.
  - You can also add **where** it is (e.g. *Kitchen*, *Room 12*) and the **type** of problem. These help to spot repeat problems.
  - Empty or spaces-only descriptions and names are refused, with a message next to the box.
- **Follow progress:** every job shows its status (**New → Scheduled → In Progress → Completed**), who is assigned, the visit date, notes and a dated history. Use the status buttons or **Filter by status** to find jobs.
- **Confirm it's fixed:** when maintenance completes a job, it appears under **Please check these repairs**. Check the repair, then select **Confirm it's fixed**. If it isn't fixed, select **Not fixed** and say what is wrong; the job is reopened. Your name and the time are recorded.
- **Announcements:** planned work booked by the manager (e.g. a gas inspection, water off). Select **I've read this** so the manager knows you've seen it.

### Maintenance team (Testimony, Ethan) – page: **Maintenance**

- **Job board:** columns for New, Scheduled, In Progress and Completed. Urgent jobs are listed first. Use **Show → Assigned to me** to see your own work.
- On each job:
  1. **Assign**: choose who will do it.
  2. **Book visit**: choose a date and time. The manager then accepts or changes it.
  3. **Arrived – start work**: records the time you attended plus a progress note, and the job moves to In Progress.
  4. **Add progress note** as the work goes on.
  5. **Complete job**: a completion note is required. Staff are then asked to confirm the repair.
- **Safety checks & testing:** gas safety, boiler, EICR, PAT, fire alarm, emergency lighting, fire doors, Legionella and water temperatures, TMVs, lift and hoist (LOLER), bed rails, window restrictors, nurse call and more.
  - Each check shows when it is due and whether it is **Overdue**, **Due soon** or **Up to date**.
  - Use **Book a date** and **Record check done**.
- **Overview & reports:** see "Reports" below.

### Home manager (Jamie) – page: **Manager**

- **Visit dates:** bookings waiting for your decision. **Accept visit**, or **Change visit date** (a reason is required). Below that is the list of agreed visits for the next 30 days.
- **Safety checks:** the full schedule. Accept or change booked dates, and assign checks.
- **Repairs:** see every repair and its history, report repairs and confirm completed work.
- **Announcements:** **Request maintenance and tell staff**. This books the work with a maintenance person and posts a notice for staff. You can see who has read it.
- **Overview & reports:** see "Reports" below.

### System administrator (Felix) – page: **Admin**

- **People & passwords:**
  - **Add a person:** name, email and role. A **temporary password** is shown once; give it to them privately. They must choose their own password at first sign-in.
  - **Reset password:** creates a new temporary password and signs the person out everywhere.
  - **Unlock** an account locked by wrong passwords, **Change role**, **Disable/Enable** or **Remove** someone (their past records are kept).
- **Cover for manager (elevation):** give a care worker or maintenance member the manager's access for a set time (up to 14 days) with a reason, for example when Jamie is on leave. They keep their own pages too. Cover ends automatically, or select **End cover now**.
- **Security log:** sign-ins, wrong passwords, lockouts, blocked pages and actions, account changes, cover and downloads. Filter it, or download it as CSV.
- **System & data:**
  - **Download backup** (repairs, checks, announcements and log; never accounts or passwords) and **Restore** from a backup.
  - **Sign everyone else out**.
  - Load or remove **sample history** for training.

### Reports (manager and maintenance) – page: **Overview & reports**

- A **chart of maintenance done** each month (repairs completed and safety checks recorded), with a table view.
- **How quickly repairs were completed**: same day, 1–2 days, or longer.
- **Recurring issues**: problems reported more than once in the same place or with the same key words.
- **Repair history**: what the job was, when it was reported, who was assigned, when the team attended, when it was completed, time taken, staff confirmation and the latest note.
- **Download report (PDF)** with the Meadow House logo on every page, or **Download spreadsheet (CSV)**. Each job card also has **Download job report (PDF)**.

---

## 3. Who can see what

| | Care staff | Maintenance | Manager | Admin |
|---|:-:|:-:|:-:|:-:|
| Repairs page (report, follow, confirm) | ✓ | | ✓ | |
| Maintenance dashboard | | ✓ | | |
| Manager page (approve dates) | cover only | cover only | ✓ | |
| Announcements | ✓ | ✓ | ✓ (create) | |
| Overview & reports | | ✓ | ✓ | |
| Admin (accounts, cover, log, backups) | | | | ✓ |

Opening a page your role isn't allowed returns you to your own page, and the attempt is recorded in the security log.

---

## 4. Security

- **Passwords:** never stored in plain text or in the code. Each is a salted PBKDF2-SHA-256 hash (600,000 iterations), checked with a constant-time comparison.
- **New passwords:** forced change on first sign-in and after every reset. Password policy: at least 12 characters, a letter and a number, no name or email, no common words.
- **Lockout:** 5 wrong passwords lock the account for 15 minutes. The administrator can unlock it.
- **Least privilege:** each role only reaches its own pages. Every change is checked against a permission table *at the moment it happens*, so hidden buttons can't be used to get round it. The role is read from the account each time, not from the session.
- **Sessions:**
  - Each browser tab signs in separately.
  - You are signed out after 15 minutes idle; sessions last at most 12 hours.
  - Changing someone's password or role, or disabling or removing them, ends their sessions everywhere.
- **Temporary manager cover:** time-limited (14 days at most), needs a reason, ends automatically and is fully logged.
- **Security log** of sign-ins, failures, blocks and admin actions (the last 1,000 events).
- **Browser protections:** a Content Security Policy on every page (no inline or third-party scripts, no network connections); all typed text is shown as plain text, never HTML; CSV downloads are protected against spreadsheet formula injection; backups never include accounts or password hashes.

**Important limit:** this is a browser-only app. Accounts and records live in the browser's local storage, so a person with full control of that computer (for example, using developer tools) could read or change them. Before real use with real residents' information, the same rules must run on a server; see `SECURITY.md` and the ideas below.

---

## 5. Ideas to make it even better

1. **Move to a secure server and shared database** (e.g. a small Node/Python API with PostgreSQL), so every device sees the same live records. Then run all permission checks on the server, behind HTTPS.
2. **Single sign-on and two-factor authentication** using the organisation's Microsoft 365 / Google accounts, so staff don't need another password.
3. **Email or text notifications**: urgent repair reported, visit booked or changed, job ready to confirm, safety check due in 7 days.
4. **Photos**: attach a photo when reporting, and before/after photos when completing.
5. **QR codes in each room**: scanning a code opens the report form with the location already filled in.
6. **Offline-friendly app (PWA)**: install it on the home's tablets and keep reporting when Wi-Fi drops.
7. **Contractor and certificate records**: store Gas Safe / EICR certificates and contractor details against each safety check, with reminders before certificates expire.
8. **Costs and budgets**: record parts and labour, and show monthly spend and the most expensive recurring issues.
9. **Resident impact and risk rating**: flag repairs that affect resident safety or dignity (e.g. call bells, hoists, hot water) for faster response targets, and report against those targets.
10. **Inspection-ready export**: one-click evidence pack of safety checks and repair history for CQC or other inspections.
11. **Accessibility options**: larger text and high-contrast mode, and read-aloud for staff who prefer it.

---

## Files

| File | Purpose |
|---|---|
| `login.html`, `login.js` | Sign-in (name or email), forced password change |
| `index.html`, `app.js` | Repairs page |
| `maintenance.html`, `dashboard.js` | Maintenance dashboard |
| `manager.html`, `manager.js` | Manager: visit dates and safety checks |
| `announcements.html`, `announcements.js` | Manager requests and staff notices |
| `overview.html`, `overview.js` | Chart, recurring issues, history, downloads |
| `admin.html`, `admin.js` | Accounts, cover for manager, security log, backups |
| `core.js` | Accounts, password hashing, sessions, permissions, audit log, data rules |
| `ui.js` | Header, forms, job cards, safety-check rows |
| `reports.js` | Charts, PDF and CSV reports |
| `logo-data.js`, `images/` | Logo (background removed) and login wallpaper |
| `vendor/` | jsPDF and jsPDF-AutoTable (MIT licences included) |
