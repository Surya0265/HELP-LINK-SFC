# HelpLink:SFC (Secured Faction Cluster)

An intelligent emergency response system that ensures timely assistance during critical situations using advanced algorithms, smartwatch integration, and voice activation technology.

> **AICTE Activity Point Programme — PSG College of Technology**
> Bachelor of Engineering — Computer Science and Engineering (AI&ML)

## Team Members

| Name | Roll No |
|---|---|
| Divya Nandini R | 23N217 |
| Nivashini N | 23N234 |
| Latshana PR | 23N223 |
| Suryaprakash B | 23N257 |
| Sai Karthi Balaji G | 23N243 |

---

## Project Planning

![Project Planning Board](docs/planning.png)

---

## Modules to be Created

| # | Module | Status |
|---|--------|--------|
| 1 | Calling System | Done |
| 2 | Gesture Detection | Done |
| 3 | Mobile Access | In Progress |
| 4 | AI Processing | In Progress |
| 5 | Web Connection | In Progress |
| 6 | Filtering System | In Progress |
| 7 | Message Sharing System | In Progress |
| 8 | Location Access (**important**) | In Progress |
| 9 | Mobile Activity Polling & Alert System | In Progress |
| 10 | Backend Skeleton (connect all modules) | In Progress |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React Native (Expo) |
| **Backend** | Python (FastAPI) |
| **API Docs** | Swagger UI (auto-generated) |

---

## Project Structure

```
HELP-LINK-SFC/
├── frontend/          # React Native (Expo) mobile app
│   ├── app/           # Screens & navigation (expo-router)
│   ├── components/    # Reusable UI components
│   ├── constants/     # App constants & config
│   ├── hooks/         # Custom React hooks
│   ├── assets/        # Images, fonts, icons
│   └── package.json
├── backend/           # FastAPI Python backend
│   ├── main.py        # API entry point
│   └── requirements.txt
├── docs/              # Documentation & images
│   └── project-planning.png
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** (v18 or above) — [Download](https://nodejs.org/)
- **Python** (v3.10 or above) — [Download](https://www.python.org/)
- **Expo Go** app on your phone — [Android](https://play.google.com/store/apps/details?id=host.exp.exponent) | [iOS](https://apps.apple.com/app/expo-go/id982107779)

### 1. Clone the Repository

```bash
git clone https://github.com/Surya0265/HELP-LINK-SFC.git
cd HELP-LINK-SFC
```

### 2. Backend Setup (FastAPI)

```bash
# Navigate to backend
cd backend

# Install dependencies
pip install -r requirements.txt

# Start the server (with auto-reload)
uvicorn main:app --reload
```

**Verify:** Open [http://localhost:8000](http://localhost:8000) — you should see:
```json
{"message": "Welcome to HelpLink:SFC API"}
```

**API Docs:** Open [http://localhost:8000/docs](http://localhost:8000/docs) for interactive Swagger UI.

### 3. Frontend Setup (React Native / Expo)

```bash
# Open a NEW terminal, navigate to frontend
cd frontend

# Install dependencies
npm install

# Start the Expo dev server
npm start
```

**Verify:** Scan the QR code shown in the terminal using the **Expo Go** app on your phone.

> **Tip:** If your phone can't connect, try running with tunnel mode:
> ```bash
> npx expo start --tunnel
> ```

---

## Key Features

- **Emergency Pattern Activation** — Unlock and trigger SOS without a password
- **Parallel Calling** — Simultaneously contact up to 10 emergency contacts
- **Gesture Detection** — 3-time blink or custom gesture triggers emergency mode
- **Smart Contact Prioritization** — AI ranks contacts by proximity and relationship
- **Voice Command Activation** — Hands-free emergency triggering
- **Smartwatch Integration** — Auto-detect abnormal pulse and trigger alerts
- **Real-time Location Tracking** — GPS location shared with emergency contacts
- **Offline Detection** — Sends last known location when device goes offline

---

## Known Limitations

### Cannot be tackled now (but important):
1. Offline system support
2. No-network area coverage

### Not possible to solve:
1. Bluetooth hopping
2. Usage of satellites

---

## License

This project is part of the AICTE Activity Point Programme at PSG College of Technology, Coimbatore.
