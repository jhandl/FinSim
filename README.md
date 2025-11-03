# Bugs
- Real Estate equity is possibly not being computed correctly.
- PRSI tax credit is not being applied.
- Net Worth is not really "net".
- Check: is withdraw% computed on the full "net worth"? Or on the investments & pensions, as it should?
- Relocation issues:
  - Missing resolution option: Cut short. "For the income and expense events, an option should be to cut it short. For example, if I move to Argentina at age 40 and there's an income event in EUR from age 30 to 50, an option should be to change the toAge to 40. The phrasing could be tricky with this one, try to make it as neutral as possible."
  - Creating an event within a relocation period should assume local currency (both when rendering and in the wizard) 
  - State pension parameter is for one country only. What about other countries?
  - No tests for the currency selectors in charts and table and the unified/natural selector.
  - No tests for relocation impact assistant.
  - No validation that there's no two relocations the same year.

# Roadmap

- Generalize taxman
- Add a feedback form
- Use a build pipeline and close the repo 
- Add monetisation

### Improvements
- Move to WASM
   - Set up build process
   - Move code to new private repo (or rename repo and create new finsim repo for prod)
   - Compile
- Feedback form: @feedback-form-plan.md
- Monetization: @monetization-plan.md
   - Pay what you want subscription 
   - Think how to prevent password / token sharing
- Horizontal timeline showing life events
- For mobile the floating + button
- Auto-save scenarios
   - Save the current scenario to the local storage when it gets dirty. When opening the page, check if there's a saved scenario. If there is, load it. If not => welcome modal.
   - Add a clear scenario button somewhere. When clearing the scenario, clean the storage as well.
- Implement analytics to replace cloudfront
- Allow three options for retirement lump sum: not take it, limit to tax-free allowance, take it all.
- Add an option to the pension contribution: Only contribute once hitting the high income tax bracket (this allows for downpayment saving while young; check with users if this makes sense though).
- Something to facilitate a different type of pension contribution, where a director or other employee can have the equivalent of =<100% of their salary paid into a pension without a BIK, USC, PRSI, CGT, etc, liability.
- New events: 
   - increase pension contribution rate.
   - pay off mortgage.
   - inheritance.
   - period of high inflation.
   - change the investment allocations throughout the simulation.
- Add registration box? Not CIO.
- Make the wizard available in accordion mode for empty NOP events.
- Let's do the Cloudflare Worker option. Add the feedback button to the burger menu, and the input form should include an optional email field and the text input field. It should look great in both mobile and desktop.
- Document the separate configs and the versioning system
- Rename Wizard to Tours
- When we load a scenario that has a country move and the destination country has a new version, or when the user creates an event with such a move, we have to show the 'tax rules update' toast notification.
- Research tax rules for when a tax resident of country A moves to country B and becomes tax resident there.

### SEO
- "Educational Sandbox", "What if lab", "not a crystal ball", "Personbal Finance Lab", "Learn by doing, experimenting, and visualizing"
- "Not affiliated with any financial institution"
- "It empowers you to ask those what if questions and see potential futures, visualized over decades, helps you think through the possibilities. Hopefully you gain valuable insights into your own financial future." 
- "Less overwhelmed by the sheer complexity of financial planning"
- Write blog posts, that explain how the simulator can help users answer their specific questions or model their own situation, maybe even linking to example scenarios.
   - About my history with finances, copy the ones I already sent as guest posts:
      - https://www.firedave.com/jorge-interview-retirement-simulator/
      - https://www.firedave.com/interview-2-jorge-dollar-cost-averaging-market-crash-stress-test/
   - Ask on reddit: What "what if" scenario are you most curious about running for your long term financial future? Based on the answers, write blog posts about the most common scenarios.
   - About "not affiliated with any financial institution"
   - About "less overwhelmed by the sheer complexity of financial planning"
   - About "educational sandbox"
   - About "personal finance lab"
   - About "learn by doing, experimenting, and visualizing"
   - About "who is this for?"
   - About the "Saving for a house deposit"
   - About "Investing vs Saving: an Irish tax perspective"
- Who is this for? 
   - People planning for retirement
   - Figuring out the affordability of buying a first home
   - Understanding the financial impact of having children,
   - Planning for education costs.
   - Modeling different drawdown strategies.
   - Seeing the impact of retiring earlier or later.
   - Teaching financial literacy.
   - Doing quick high level scenario modeling during client meetings, to illustrate a point visually.
- Figure out a way to include phrases like:
   - deemed disposal
   - income tax calculator
   - pension calculator
   - budget planner
   - household budget calculator
   - compound interest calculator
   - savings calculator
   - take home pay calculator
   - retirement calculator
   - retirement income calculator
   - tax on investments
   - tax on dividends
   - tax on capital gains
   - tax on savings
   - tax on retirement income
   - tax on income
   - tax on expenses
   - tax on inheritance
- Maybe list all the useful sites that have specific calculators for each of those things, and explain how we integrate all of it in one place.
- Add an FAQ section, based on questions on reddit and about the simulator.
   - What taxes are considered?
   - Is it better to contribute to pension or save?
   - How is FinSim different?
      - Comprehensive scope, an "All-in-One" tool covering multiple aspects of personal finance
      - Irish tax system
      - Privacy
      - No ads or tracking
      - No need for signup or login
      - Free to use
      - Interactivity ("what if")
- Look up what "meta titles" are.

### Ideas
- I learned about finance and investing late in life. There’s a lot like me. Help them get to where I am. (And plan their retirement? No, that’s financial advice)

### Feedback
- Escala para ayudar a calcular el rate de sueldo
- Dar ejemplos de rate de real estate como hice con volatility
    - Para eso estaría bueno fetchear los datos de algún sitio, asignarlos a config y usar una variable

## Version 2 - "Web version"
- Move the urls from the help yaml to the config file and use variables in the yaml
- Review pension types (ChatGPT “Pension Types in Ireland”) 
- Add ability to fetch data from the web / google sheets

## Version 3 - "Modernize"
- Make things more generic so they apply to different systems (notepad "Generic Tax System").
- Reimplement the UI in React

## Version 4 - "Complete"
- Handle loss harvesting for trusts
- Did I consider debt (other than mortgage)?
- Add inflation volatility
- Add dividends and their tax
- Add a step function to represent government's delayed updates
- Add self-employed option, joint declaration, etc
- Change input system to capture the details needed for things like personal tax credits, benefits, etc.

## Version 5 - "Expand"
- Enable sharing with scenario(s) included
- Add retirement account evolving strategies (stock / bonds proportion changing over time)
- Add retirement account drawdown strategies (drawdown from bonds when stocks drop, 4% rule, etc)
- Add countries and a way to select a country
- Add an event to move to a country
- Add a way for an AI agent to research a country and generate the config file for it
- Consider the tax treaties between countries when moving to another country
- Produce a log of what happened over the years (bought "cuba", sold ETF for $x, couldn't cover expenses, etc)
- Analyse the log with LLM to produce a summary of what happened and maybe some recommendations
- Add a way for the user to get an AI explanation of a point in the graph
- Highlight critical data points (depleted savings, SM crash, etc) with annotations on the graph.
- Generate PDF or Excel reports summarizing simulation results for easy sharing or record-keeping
 
Important notes for developers:
- The tax engine has been renamed from `Revenue.js` to `Taxman.js`. Core tax computation is now driven by `TaxRuleSet` and the app's `defaultCountry` configuration.
- The `defaultCountry` setting lives in `src/core/config/finsim-2.0.json` and is exposed via `Config.getDefaultCountry()`.
- Add crypto because the laws in each country can be different for that (and let user select growth model - stock-to-flow, etc)
- Include features for calculating loan amortization, overpayments, and refinancing scenarios
- Allow user to select compare scenarios:
  - Show the graphs with a list of radio buttons to select which one to show, run on demand and draw gradually
  - Allow selecting two scenarios and add a slider to the graph to compare them (like disaster area photos)
  - Maybe rank them by success rate?
- Add a video demonstration with generated voices in different languages
- Add screen reader support and keyboard navigation for better accessibility


## Version 6 - "Monetize"
- Add a way to have EA and GA so people can test before it goes out to everyone
- Add campaigns to CIO to let people of a country know they have a new version to test (use API so it goes out as soon as the AI made changes)
- Integrate with payments provider
- Let people pledge to subscribe for adding a country. If enough people do it, add it, and they get a discount.
- Implement a tiered model:
  - Free: Basic features (save to one file, 0% volatility deterministic runs, no crypto, no log, no analysis), limited to 1 country
  - Essential: All features, limited to 1 country
  - Pro: Essential + unlimited countries
  - Premium: Pro + dedicated support
- Offer free trials to other tiers
- Offer modular upgrades (e.g., Monte Carlo add-on, country-specific tax systems).
- Add a donation button for free version users
- Add a chat box - Intercom?

