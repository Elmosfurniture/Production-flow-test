# UI Design Skill — elmo's Production

## When to use this skill
Use this whenever building or editing any screen, component, or UI element in elmo's Production.

## Design Philosophy
This app follows iOS design principles — clean, soft, minimal, and tactile. Every element should feel like it belongs in a native iOS app. No harsh edges, no flat corporate look. Think Apple Notes meets a factory dashboard.

## Colours — use these exactly
- Page background: #F5F3EF (warm off-white, never pure white)
- Card background: #FFFFFF
- Primary navy: #1C2B4A
- Brand red: #C0392B (elmo's logo red)
- Accent orange: #E8944A
- Text primary: #1C2B4A
- Text secondary: #6B7280
- Text light: #9CA3AF
- Border: #E5E7EB
- Success green: #10B981
- Warning orange: #F59E0B
- Danger red: #EF4444
- Selected/active chip: #1C2B4A background, white text

## Spacing & Shape
- Card border radius: 16px
- Button/chip border radius: 999px (fully round pills)
- Input border radius: 12px
- Card shadow: 0 2px 8px rgba(0,0,0,0.06)
- Card padding: 20px
- Section gap: 24px
- Never use sharp 0px corners anywhere

## Typography
- Font stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- App name: "elmo's" in #C0392B bold, "Production" in #1C2B4A bold
- Screen title: 28px, bold, #1C2B4A
- Section label: 11px, uppercase, letter-spacing 0.8px, #9CA3AF
- Body text: 14px, #1C2B4A
- Secondary text: 13px, #6B7280
- Numbers/stats: 32px bold, #1C2B4A

## Login Screen Rules
- Single centered column, max-width 400px
- Logo image at top, 110px wide, rounded corners 12px
- NO duplicate app name text if logo already shows it
- Greeting text: 28px bold, "good morning/afternoon/evening,"
- Subtitle: 14px grey, "choose your bench to clock in."
- Shift pill: small rounded pill with green dot, grey border
- Department chips: 2x2 grid, pill shaped, border #E5E7EB, selected = navy filled
- Role chips: horizontal row of 3, same pill style
- PIN dots: 4 circles, filled navy when digit entered
- Numpad: 3x4 grid, each key is a white rounded square (16px radius) with soft shadow, large number text, letter subscript in small grey

## Dashboard Rules
- Fixed sidebar: 240px wide, white background, soft right border
- Sidebar sections: PRODUCTION / TRACKING / CONFIG in small uppercase grey labels
- Active nav item: light navy background (#EEF2FF), navy text, left accent bar
- Stat cards: white, 16px radius, soft shadow, coloured top border (3px)
- Machine cards: white, 16px radius, coloured left border showing status
- Overdue banner: soft red background #FEF2F2, red border left, red text
- At Risk tag: orange pill #FEF3C7 with orange text
- Overdue tag: red pill #FEE2E2 with red text

## General Rules
- Every interactive element has a hover state (slightly darker background)
- Every card has a soft shadow — never flat cards with just a border
- Use icons from lucide-react for all nav items and action buttons
- Stat card top borders: Active Orders=blue, Machines Active=blue, Machines Idle=orange, Parts=purple, Completed=green
- Always mobile responsive — sidebar collapses on small screens
- Loading states should show skeleton placeholders not spinners
