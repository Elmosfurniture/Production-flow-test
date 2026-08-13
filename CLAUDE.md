elmo's Production App — CLAUDE.md
Project Overview
Production management app for elmo's Furniture factory in Kruisfontein, Eastern Cape, South Africa. Family business, brand name CORE. Built with React 18 + Vite + Tailwind CSS + Supabase. Started as a single HTML file (steelflow-elmo-v2-stable.html) and is being ported to a full React app.
Project Location
C:\Users\Pieter\Desktop\Claude code VS\steelflow
Tech Stack

React 18 + Vite
Tailwind CSS
Supabase (oevjemzjuorbcklkxity.supabase.co)
React Router
lucide-react icons
All Supabase calls go in src/lib/ not in components

To Start App
cd "C:\Users\Pieter\Desktop\Claude code VS\steelflow"
npm run dev
Open http://localhost:5173
Design Style
iOS-inspired, warm off-white #F5F3EF background, navy #1C2B4A, orange/amber #E8944A, white cards with soft shadows, 16px rounded corners, Inter font. Dark mode supported via data-theme="dark" on body.
Roles & Access

Boss (Elmo): full access — edit everything, import data, manage employees
Manager (Roberto): edit schedules and tracking, not employees or system settings
Worker: only operate MES Station — Start, Pause, Stop jobs
Login is PIN-based, 4-digit PIN stored in Supabase employees table
Default Boss PIN: 9999

Factory Departments

Steel (metal fabrication)
Wood (woodworking and CNC)
Upholstery
Dispatching

Supabase Database Tables

employees: id, name, role (text), departments (department_enum[]), pin, created_at
customers: id, code, name, contact, created_at
machines: id, name, department (department_enum), color (text), created_at
products: id, code, description, department (department_enum), default_priority, created_at
parts: id, product_id, name, qty_per_unit, length, width, thickness, material_code, created_at
machine_steps: id, part_id, sequence, machine_name, seconds_per_part, setup_time, created_at
orders: id, kwitasie_nr, qty, product_code, description, customer_code, ord_nr, group, prod_week, prod_day, send_week, send_day, wood_type, notes, department (department_enum), due_date (date), created_at
schedule: id, order_id, machine_name, scheduled_date, start_time, end_time, status (queued/running/paused/complete), operator_id, created_at

SQL Migrations Already Run

001: Initial schema (employees, customers, machines, products, parts, machine_steps, orders, schedule)
002: Added department column to orders table
003: Added unique index on parts (product_id, name)
Added due_date date column to orders table
Added color text column to machines table
Added unique constraint on machines (name, department)
Added missing columns to employees table (name, pin, created_at)
Converted employees.role from enum to plain text
Added SA public holidays table and buffer days configuration

CSV Import System
Weekly workflow — two CSVs exported from Microsoft Access:
OrderW22.csv columns:
Kwitasie # (unique order ID), Qty, Item (product code), Beskrywing (description), Hout (wood type), Ord # (order number), Group (determines department), Week (prod start week), Dag (prod start day 1-5), Send (dispatch week), DDay (dispatch day), Tak (customer code), Note, RDate (requested date), Due (committed date — most important)
Department detection from Group column:

Contains furn/chair/moulder/cnc → wood
Contains st → steel
Contains uphol → upholstery
Contains disp → dispatch
Default → wood

PartsMapW22.csv columns:
Code (product code), Part Beskrywing (part name), QTY (qty per unit), cLENGTE, cWYDTE, cDIKTE (dimensions, not used yet), NOTA, Materiaal Kode (not used yet), Seq (step sequence), Machine (machine name), sek (seconds per part), SUT (setup time minutes)
Backwards Scheduling Engine (src/lib/scheduleEngine.js)
Core logic — calculates production start date from Due date:

Look up product parts and machine steps from Supabase
For each part: total parts = QTY per unit × order Qty
For each step: total seconds = (sek × total parts) + (SUT × 60)
Group steps by machine, sum total seconds per machine
Machines run in PARALLEL — bottleneck machine (highest total seconds) determines duration
Convert bottleneck seconds to work days (Mon-Thu = 515 min effective, Fri = 390 min effective, average = 490 min)
Add buffer days (configurable per department, default 3)
Count backwards from Due date skipping weekends and SA public holidays
Result = calculated prod_week and prod_day

Critical Ratio (CR) Calculation
CR = weeks remaining until dispatch / weeks needed to produce

CR < 1.0 → OVERDUE, red
CR 1.0–3.0 → urgent, amber
CR 3.0–5.0 → normal, yellow
CR > 5.0 → comfortable, green
Sort ascending by CR (most urgent first)
Tiebreaker: longest bottleneck machine time goes first

SA Public Holidays 2026 (seeded in Supabase)
New Year's Day, Human Rights Day, Good Friday, Family Day, Freedom Day, Workers Day, Youth Day, National Women's Day, Heritage Day, Day of Reconciliation, Christmas Day, Day of Goodwill
Machine Lists
Steel Machines (23):
Chamfer, Cut-Off CSM, Cut-Off SLS, Drill Press Manual, Drill Semi Auto 2 bit, Grinders Manual, Ironworker, Robot Welder 1400, Robot Welder 1600, Sander Horizontal, Sander Orbital Steel, Sander Osilating, Spray Paint, Swage Semi Auto, Tube Bender E-Turn 32, Tube Bender E-Turn 40, Tube End Closing, Tube Laser M-Rise, Welder Arrie, Welder Dino, Welder Francis, Welder Jeff, Welder Kelvin
Wood Machines (49):
Band Saw Centauro, Band Saw Duplex, Chair Assembly 1, Chair Assembly 2, Clamp A frame, Clamp Book, Clamp Taylor 12, Clamp Taylor 6, Clamp Vertical, CNC Biese Klever 1, CNC Biese Klever 2, CNC Double Jet, CNC Sharp, CNC Sintisi, CNC Venture 2, Furn Assembly 1, Furn Assembly 2, Lathe Intorex, Linear Shaper FC4, Linear Shaper FC6, Moulder Unimat 500, Planer Surface, Putklamp, Sander Edge Sander, Sander Lathe, Sander Orbital 150 Manual, Sander Orbital 150 Semi Auto, Sander Orbital 200 Semi Auto, Sander Prep, Sander Sanding Line, Sander Top & Bot 2C2L, Sander Vertical, Sander Waterfall, Sander Widebelts SCM, Sander Widebelts Viet, Sanding Manual, Saw Cut-off T350, Saw Double Cut-Off Friulmac, Saw Panel Saw, Saw Straight Line 1, Saw Straight Line 2, Saw Straight Line 3, Saw Up Cut, Saw Up Cut Tigerstop, Saw Wintersteiger, Seat Shaper, Tenoner TSD, Top & Bottom (L), Top & Bottom (S)
Machine Name Mapping (Old App → New App)
Cutt off → Cut-Off CSM, Tube Laser → Tube Laser M-Rise, Swage → Swage Semi Auto, E40 → Tube Bender E-Turn 40, E32 → Tube Bender E-Turn 32, End Closing → Tube End Closing, Weld (Robot) → Robot Welder 1400, Weld (Arrie) → Welder Arrie, Weld (Dino) → Welder Dino, Weld (Francis) → Welder Francis, Weld (Jeff) → Welder Jeff, Weld (Kelvin) → Welder Kelvin, Grind → Grinders Manual, Boor → Drill Press Manual, Paint → Spray Paint, Top & Bott planer → Top & Bottom (L), Size → Saw Double Cut-Off Friulmac, Size (Paneel) → Saw Panel Saw, Skuur (SCM) → Sander Widebelts SCM, Skuur (Top & Bott) → Sander Top & Bot 2C2L, Skuur (Bus) → Sander Sanding Line, FC 4 → Linear Shaper FC4, FC 6 → Linear Shaper FC6, Double Jet → CNC Double Jet, TSD → Tenoner TSD, Sintesi → CNC Sintisi, Biesse → CNC Biese Klever 1, Venture 2 → CNC Venture 2, Draaibank → Lathe Intorex, Broodmasjien → Saw Wintersteiger, Sharp → CNC Sharp
Screens — Current Status
✅ Working & Connected to Supabase:

ImportScreen (src/screens/ImportScreen.jsx) — CSV import, seed machines, recalculate schedule buttons all working
MESStationScreen (src/screens/MESStationScreen.jsx) — full timer, lap log, mandatory pause/scrap modals, yield per cut, complete step, add extra qty. Route: /mes-station. NOT in sidebar.

⚠️ Partially Working (shows real data but incomplete):

PriorityScreen — fetches real orders from Supabase, CR sorting works, department tabs filter correctly, but drag-to-reorder not yet wired to Supabase
MachinesScreen — shows real machines from Supabase, edit machine name and color works, active/disabled toggle and delete not yet wired
OptionsScreen — buffer days per department works, SA public holidays seed works, employee PIN management UI exists but not fully wired

❌ Still Mock Data (needs connecting to Supabase):

DashboardScreen — all hardcoded numbers
WeekPlanScreen — hardcoded calendar orders
ScheduleScreen — hardcoded machine rows and jobs, MES button navigates to /mes-station but passes hardcoded data
TrackingScreen — hardcoded job statuses
DispatchScreen — hardcoded orders
ProductsScreen — hardcoded product list
CustomersScreen — hardcoded customer list
LoginScreen — accepts any 4-digit PIN except 0000, does not check employees table yet

Key Files

src/lib/supabase.js — Supabase client
src/lib/importCSV.js — CSV parsing and import logic for orders and parts map
src/lib/seedMachines.js — machine seeding, addMachine(), updateMachine()
src/lib/scheduleEngine.js — backwards scheduling engine, CR calculation, SA holidays
src/lib/scheduleConfig.js — buffer days per department, holiday management
src/components/Sidebar.jsx — shared sidebar component used by all screens
src/App.jsx — routing configuration

Current Priorities (Phase 2)

Fix PIN login to check employees table in Supabase
Connect Dashboard to real Supabase data
Connect Schedule screen to real data and wire MES button with real job details
Connect Tracking screen to real data
Wire drag-to-reorder on Priority screen to Supabase
Complete the JSON import from old app with correct machine name mapping
Fix all broken buttons (logout, department tabs on screens that still have them hardcoded)

Important Rules

Never hardcode department as 'steel' — always use detectDepartment()
All Supabase calls go in src/lib/ not in components
Do not change working code unless specifically asked
The MES Station screen must never appear in the sidebar
Machine names in the Parts Map CSV must match machine names in the machines table exactly
The Due date column is the committed delivery date and drives all scheduling calculations
Backwards scheduling counts backwards from Due date through real work days only (no weekends, no SA public holidays)