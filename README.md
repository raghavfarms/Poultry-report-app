# Poultry Farm Report Management System

A mobile-first MERN application for daily poultry-farm reporting. Labour can register for Raghav, Sanjana, or both firms, enter daily data from a phone, and review reports immediately. Admin can see both firms, edit the same entries, and manage dynamic gensets and tractors.

Diesel Consumption is fully implemented. The remaining workbook modules are present in the sidebar and overview as the next development phases:

- Raw Material
- Feed Production
- Bird Stock
- Egg Stock
- Hatching Egg Summary
- Medicine Requirement
- Packing Material
- Vermicompost
- Attendance
- Solar Status
- Vaccination Status

## What is implemented

- One-time admin setup creates the **Raghav** and **Sanjana** firms. There is no seed file.
- Labour self-registration with mandatory selection of one firm or both firms.
- JWT login and role/firm-based API access.
- Default all-report overview after login, with seven days per firm and newest date first.
- Raghav report followed by Sanjana report when both are accessible.
- Firm and custom date filters.
- Earliest-missing-date selection. If 16 and 17 are filled but 18 and 19 are missing, the form selects 18.
- Labour cannot skip a missing date or enter future data. Admin can edit any date.
- Dynamic assets per firm: add, edit, soft-remove, restore, order, category, tank capacity, and service interval.
- Historical asset snapshots keep old reports correct after an asset is renamed or removed.
- Daily diesel entry: Opening, Diesel IN, running H:M, refill, Full, service done, light consumption, note.
- Automatic Electricity = 24:00 − Light consumption.
- Automatic Diesel Consumption = sum of all asset refills.
- Automatic Closing = Opening + IN − Diesel Consumption.
- Opening/closing stock is recalculated as one continuous chain, so editing an old day updates later openings correctly.
- Full-to-full average per asset. Hours and partial refills accumulate until a real full refill closes the cycle.
- Service running hours, hours remaining, due flag, and last service date per asset.
- Mobile report cards and a detailed desktop table.
- CSV export and print.

## Project structure

```text
poultry-reporting-system/
├── backend/     Express, MongoDB, JWT, report calculations
├── frontend/    React, Vite, Tailwind CSS, responsive UI
└── README.md
```

## Run locally on Windows

Requirements: Node.js 20 or newer and MongoDB (local MongoDB or MongoDB Atlas).

### 1. Configure the backend

Open PowerShell in `backend`:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set:

```env
PORT=5000
MONGODB_URI=your-mongodb-connection-string
JWT_SECRET=use-a-long-random-secret-here
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
```

Do not commit the real `.env` file.

### 2. Configure the frontend

Open PowerShell in `frontend`:

```powershell
Copy-Item .env.example .env
```

For local development, keep:

```env
VITE_API_URL=http://localhost:5000/api
```

### 3. Install and start

From the project root:

```powershell
npm install
npm run install:all
npm run dev
```

Open `http://localhost:5173`.

### 4. First use

1. Click **Set up the admin** on the login screen.
2. Create the first admin. This also creates Raghav and Sanjana.
3. Open **Firms & Assets**.
4. Set the initial diesel opening balance for each firm.
5. Add that firm’s gensets and tractor. A typical asset can be named `30 KVA`, `82 KVA`, `125 KVA`, or `Tractor`, but names are not hardcoded.
6. Log out and use **Create an account** for each labour user. Select one or both firms during registration.

## Average calculation

The average is not stored in MongoDB; it is calculated dynamically from the report history.

Example:

- Day 1: runs 30 minutes, no refill.
- Day 2: runs 30 minutes, no refill.
- Day 3: runs 10 hours, refills 100 L, and ends Full.
- Cycle running = 11 hours.
- Average = 100 ÷ 11 = **9.09 L/hour**.

A Full mark with no accumulated refill does not close/reset the cycle. This prevents a default checked box from losing hours.

## Service calculation

Each asset defaults to a 225-hour interval. The report accumulates running minutes after the latest service. Marking **Service done today** resets the counter to zero and records that date. While an old entry is edited, the form starts from service time before that date and adds the current form value, so saved hours are not counted twice.

## Verification

Run the calculation tests and production frontend build:

```powershell
npm test
```

## Deployment

### Backend on Render

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Environment variables: `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_URL`
- After deployment, verify `https://YOUR-RENDER-URL/api/health`.

### Frontend on Vercel

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_URL=https://YOUR-RENDER-URL/api`

Then update backend `CLIENT_URL` to the exact Vercel frontend URL. Multiple allowed frontend URLs can be comma-separated.

## Important production note

Public labour registration is enabled because that was requested. If farm accounts must be controlled, the next security improvement should be admin approval or invitation codes for labour registration.
