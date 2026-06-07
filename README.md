# 🚀 TaskPilot AI — The AI Execution Operating System

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js 16](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![PostgreSQL/Supabase](https://img.shields.io/badge/Supabase_PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-8E75C2?style=for-the-badge&logo=googlegemini&logoColor=white)](https://deepmind.google/technologies/gemini/)


TaskPilot AI is a premium, developer-centric **AI Execution Operating System** designed to eliminate procrastination, audit daily cognitive workload budgets, and decompose mental friction in real-time. 

Instead of traditional, rigid calendar slots that break on the first delay, TaskPilot AI focuses on **execution intelligence**—providing a dynamic flow state dashboard, dynamic blocker unrolling, self-healing telemetry, and zero-cost local calendar feeds.

---

## 🎥 Video Walkthrough

<p align="center">
  <img src="./assets/demo-video.gif" width="100%" alt="TaskPilot AI Walkthrough" />
</p>

---

## 🎨 Key Features & Cognitive Architecture

### 1. Immersive Distraction-Free Focus Workspace
*   **Immersive Flow State**: Collapses sidebars and layout surrounds, replacing them with a dark `#030014` cosmos backdrop and breathing radial ambient glow rings.
*   **Pulsing flow progress ring**: A glowing, responsive SVG progress ring showing remaining time.
*   **Countdown-to-Stopwatch timer**: Counts down, and once it hits `00:00`, dynamically switches to red-warning stopwatch mode to log overrun durations and capture exact `actual_duration` metrics.

### 2. Cognitive Workload Realism Widget
*   **Workload Realism Score**: Displays a custom circular realism gauge (0-100%) showing planned workload feasibility.
*   **Burnout Risk Detection**: Alerts users with pulsing overload tags when planned durations exceed daily cognitive deep work budgets (default 240 mins).
*   **Gemini Execution Advice**: A customized italic block showcasing real-time scheduling recommendations parsed using Gemini 1.5 Flash structured outputs.

### 3. "Stuck?" AI Contextual Unblocker
*   **Direct Blocker Ingestion**: Clicking "Stuck?" inside focus mode opens a prompt to input your mental or technical bottleneck.
*   **Dynamic Order Insertion**: Shift-inserts 2-3 specific, 10-minute micro-starter subtasks *immediately before* the stuck step.
*   **Active Cursor Highlights**: The big intimidating step is pushed down, and the micro-tasks instantly light up as active, highlighted focus tasks right under your cursor—bypassing inertia without manual list reordering.

### 4. Dynamic Webcal Subscription Feed ($0 OAuth Alternative)
*   **Webcal Streaming (`webcal://`)**: Exposes a dynamic, read-only iCalendar feed secured by a unique 16-character SHA-256 hash of a user's email.
*   **Native Desktop Auto-Sync**: Allows users to click "Subscribe Natively" to link their schedule with Apple Calendar, Microsoft Outlook, or Notion Calendar instantly—zero complex Google OAuth consent screens, zero token leak risks, and $0 cost.

### 5. Self-Healing Telemetry Auto-Migrations
*   **Automated Schema Alterations**: The backend automatically scans the database on hot reload and executes alter statements wrapping new behavioral metrics (ambiguity score, resistance score, procrastination count, difficulty rating, actual duration) in try-except bounds.
*   **Telemetry Logs**: Records self-assessed difficulty (1 - Shallow/Admin to 5 - Cognitively Brutal) and exact overruns to train future AI scheduling predictions.

### 6. Intelligent Timeline Overrun & Sidebar Delays
*   **Double-Entry Overrun Triggers**: Provides delay adjustments (`+15m`/`+30m`) on both the main sequential list cards and the right-hand **Focus Timeline Sidebar**.
*   **Zero-Overlap Repacking Engine**: Delays recalculate dynamically on click, triggering a greedy interval packing algorithm that shifts subsequent flexible tasks around calendar busy slots and locked boundaries with zero manual friction.
*   **Compact Hover HUD**: Hovering over any sidebar task card reveals micro-interactive shortcuts: start focus (`Play`), toggle locking state (`Lock`), or delay the slot instantly.

---

## 🗺️ System Architecture

```mermaid
graph TD
    A[Next.js 16 Frontend] -- 1. Ingest Blocker / Log Rating / Trigger Sidebar Delay --> B[FastAPI Backend REST API]
    B -- 2. Evaluate Capacity & Friction / Repack Slots --> C[Gemini 1.5 Flash]
    C -- 3. Structured Pydantic Output --> B
    B -- 4. Write Telemetry & Steps --> D[(Supabase PostgreSQL / SQLModel)]
    D -- 5. Auto-Heal Columns & Sync --> B
    B -- 6. Dynamic ICS Webcal Stream --> E[Native Calendar Apple/Outlook]
```


---

## 🛠️ Step-by-Step Installation & Bootstrapping

Ensure you have **Python 3.10+** and **Node.js 18+** installed.

### 1. Backend Service Setup (FastAPI + SQLModel + SQLite)

Open a new terminal window in the root directory `TaskPilot AI` and run:

```bash
# Navigate to the backend directory
cd backend

# Create a clean Python Virtual Environment
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate

# Install all backend requirements
pip install -r requirements.txt

# Start the FastAPI hot-reloading development server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

*Note: The SQLite database (`taskpilot.db`) and its self-healing migrations are generated automatically in the `/backend` folder upon server startup.*

### 2. Frontend Application Setup (Next.js 16 + Tailwind CSS v4)

Open a **separate** terminal window in the root directory `TaskPilot AI` and run:

```bash
# Navigate to the frontend directory
cd frontend

# Install Next.js node packages
npm install

# Run the Next.js development server
npm run dev
```

*Tip: If npm encounters EACCES permission folder errors on your machine, boot the local sandbox cache instead:*
`npm_config_cache="./npm-cache" npm install && npm_config_cache="./npm-cache" npm run dev`

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) to load the dashboard!

---

## ⚙️ Environment Configuration

### Backend `/backend/.env`
| Variable | Purpose | Default / Production Setup |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google GenAI API Key for structured performance audits. | *(Empty / Sandbox Fallback)* |
| `DATABASE_URL` | DB Connection String. Supports local SQLite and Supabase PostgreSQL. | `sqlite:///./taskpilot.db` (SQLite) <br> `postgresql://postgres.[id]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require` (Supabase Connection Pool URI) |
| `ALLOWED_ORIGINS` | Restricted allowed origins for CORS. Fixes credentials wildcard vulnerability. | `http://localhost:3000,http://127.0.0.1:3000` |
| `JWT_SECRET` | Secure cryptographic secret key for signing user auth tokens in production. | *(Random dynamic hash generated on server boot if unset)* |

### Frontend `/frontend/.env`
| Variable | Purpose | Default |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Backend REST gateway domain. | `http://127.0.0.1:8000/api` |

---

## 🗄️ Database Migration to Supabase (PostgreSQL)

TaskPilot AI utilizes SQLModel (built on SQLAlchemy) allowing seamless, zero-downtime migrations between local SQLite development databases and cloud-hosted production PostgreSQL instances like Supabase.

### Step-by-Step Supabase Migration Playbook:

1. **Provision a Database on Supabase**:
   - Log in to your [Supabase Dashboard](https://supabase.com) and create a new project.
   - Set a secure database password and wait for your database instance to provision.

2. **Retrieve Connection String**:
   - Navigate to **Project Settings** > **Database** on Supabase.
   - Copy your **Connection URI** under the "Connection String" block. Ensure you select the **Transaction Connection Pooler (Port 6543)** for optimal serverless scaling.
   - The URI should look like: `postgres://postgres.[project-id]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require`

3. **Configure Environment Variables**:
   - Open `/backend/.env` and paste your Supabase connection string:
     ```env
     DATABASE_URL=postgres://postgres.abcde12345:mysecurepassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
     ```
   - *Note: TaskPilot AI's database engine automatically detects `postgres://` connection string formats and transparently rewrites them to SQLAlchemy-compliant `postgresql://` formats at runtime!*

4. **Verify CORS and JWT Protections**:
   - Set your production origin in the `.env` to prevent credential leakage:
     ```env
     ALLOWED_ORIGINS=https://my-production-domain.com,http://localhost:3000
     JWT_SECRET=super_secure_permanent_crypto_key_for_user_auth_tokens
     ```

5. **Run Self-Healing Schema Autogeneration**:
   - Boot your backend server:
     ```bash
     cd backend && source venv/bin/activate
     uvicorn app.main:app --reload
     ```
   - **Expected Result**: On startup, SQLModel scans the active Supabase connection, automatically constructs all tables (`user`, `project`, `task`, `taskstep`, `scheduleslot`), maps foreign keys, sets index bindings, and runs self-healing telemetry column migrations. No manual `.sql` migration files are required!

---


## 🔍 Step-by-Step Feature Validation Playbook

Step through these production validation flows to experience TaskPilot AI's behavioral intelligence:

### 🧪 Playbook 1: Cognitive Load Realism & Live Gemini Advice
1. Boot the application, sign up, and create a Project. Click **Decompose**.
2. Click **View Schedule** on the header and generate a sequential timeline. 
3. Return to the **Dashboard Overview** (`/dashboard`).
4. **Expected Result**: The **Cognitive Realism Widget** lights up at the top:
   * It displays a circular percentage gauge (e.g. 80%) indicating how realistic your planned day is.
   * If total deep work tasks exceed your budget (240 mins), it flashes an **"Overload Risk"** warning badge.
   * Under **Gemini Execution Advice**, it outputs dynamic, professional scheduling advice explaining exactly how to split your tasks, avoid cognitive fatigue, and protect your rest windows.

### 🧪 Playbook 2: Focus Flow Workspace & Stopwatch Overruns
1. Navigate to your schedule timeline page or a project tasks workspace.
2. Click the green **Play (Start Focus Session)** button next to any task.
3. **Expected Result**: You are directed to `/dashboard/focus/[id]`. The sidebar collapses, entering fullscreen focus mode with an ambient cosmic breathing background.
4. Set the timer to tick down. Let the countdown hit `00:00`.
5. **Expected Result**: The digital clock transitions into a bold red stopwatch reading **"+00:01"** and continues counting *up* natively, ensuring you capture exact overruns.
6. Click the green checkbox **Complete** icon.
7. **Expected Result**: A star rating selector overlay opens. Rate the task's cognitive difficulty from **1 (Shallow/Admin)** to **5 (Cognitively Brutal)**. Click **Log Telemetry & Exit** to commit the actual minutes and difficulty rating back to SQLite!

### 🧪 Playbook 3: "Stuck?" Blocker Subdivision & Active Ordering
1. Inside the Focus Workspace, identify your currently active incomplete sub-step.
2. Click the **"Stuck?"** helper badge next to the step.
3. In the overlay modal, input a bottleneck (e.g. *"I don't know how to structure this database connection"* or *"CORS console throws origin blocked errors"*).
4. Click **Get AI Heuristics**.
5. **Expected Result**: The backend shifts all subsequent steps down in order index and dynamic prompt decomposition appends **2-3 specific 10-minute micro-subtasks** immediately before your cursor. The new micro-tasks instantly highlight as the active incomplete steps, unrolling your mental inertia without losing your focus timer value!

### 🧪 Playbook 4: Dynamic Local Calendar Feed Subscription
1. Navigate to the **Schedule** timeline dashboard page (`/dashboard/schedule`).
2. Click the glowing **Local Calendar Feed** button on the action menu header.
3. **Expected Result**: A custom Webcal feed overlay opens, exposing a private feed link structured as `webcal://127.0.0.1:8000/api/users/{feed_token}/calendar.ics`.
4. Click **Subscribe Natively**.
5. **Expected Result**: Your browser opens your computer's native default calendar application (Apple Calendar on Mac, Microsoft Outlook on Windows) instantly, prompting you to subscribe to the live TaskPilot AI schedule feed at $0 cost!

<p align="center">
  <img src="./assets/calendar-sync.gif" width="90%" alt="Webcal Calendar Subscription Demo" />
</p>

### 🧪 Playbook 5: Interactive Focus Timeline Sidebar Delays
1. Navigate to the **Schedule** timeline page (`/dashboard/schedule`).
2. Locate the **Focus Timeline** sidebar on the right.
3. Hover your cursor over any active task slot (non-calendar event) inside the hourly timeline slots list.
4. **Expected Result**: An elegant HUD overlay reveals itself with smooth animations:
   * **Play (Start Focus)**: Clicking this redirects you straight into execution mode for that task.
   * **Lock Toggle**: Clicking locks/unlocks the task slot from being shifted dynamically.
   * **Delay buttons (`+15m` / `+30m`)**: Clicking these updates the timeline dynamically, repacking subsequent tasks safely using the backend's constraint-aware packing engine.
   
   The loading overlay elegantly confirms status updates during each recalculation!
