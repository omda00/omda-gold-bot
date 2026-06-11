---
Task ID: 1
Agent: Main Agent
Task: Redesign gold investment strategy based on PDF analysis (ذهب.pdf)

Work Log:
- Extracted and analyzed full text from ذهب.pdf (9-page gold investment analysis report, June 2026)
- Studied PDF content including: price evolution, DCA strategy, buy/sell zones, key drivers, risk assessment, gold rules, target audience
- Updated seed data in /src/app/api/plan/seed/route.ts with PDF-aligned buy/sell zones and Arabic labels
- Completely redesigned /src/components/dashboard/investment-plan.tsx with comprehensive strategy UI:
  - Executive summary card
  - DCA strategy phases (3 phases with allocation percentages)
  - Buy/sell zone table with color-coded action badges
  - 5 expandable accordion sections: Price Timeline, Key Drivers, Strengths & Risks, Golden Rules, Target Audience
  - Immediate implementation tips card
  - Current signal card (retained from previous design)
- Re-seeded investment plan data via API call
- Verified with Agent Browser - all sections render and expand correctly

Stage Summary:
- Investment plan now reflects comprehensive PDF-based strategy until end of 2026
- All Arabic text renders correctly with modern UI/UX design
- DCA phases: Phase 1 (40% at 6,100-6,200), Phase 2 (30% at 5,800-5,900), Phase 3 (30% after 2-week stability)
- Buy/sell zones: Strong Buy (5,700-5,900), Gradual Buy (6,100-6,300), Watch (6,300-6,800), Sell 30% (7,000-7,200), Sell 50% (>7,500)
- Lint passed with no errors
