# Bugs

# Roadmap

### Improvements
- Add tooltips to the data table cells showing the origin of the numbers.
- Allow three options for retirement lump sum: not take it, limit to tax-free allowance, take it all.
- Add an option to the pension contribution: Only contribute once hitting the high income tax bracket (this allows for downpayment saving while young; check with users if this makes sense though).
- Auto save of changes to a scenario? A toggle maybe?
- Forms-like data input. While highlighting the relevant section in the background, ask questions and populate fields, with a nice animation showing the entered data moving to the corresponding sections. Auto saving along the way so if you go back it goes to step 2 etc. The personal tax credit must ask about all possible personal circumstances, like PWC's calculator.
- New events: 
   - increase pension contribution rate.
   - pay off mortgage.
   - inheritance.
   - period of high inflation.
- Add feedback box.
- Add registration box? Not CIO.
- Allow to specify a max drawdown %. If failing during retirement, reduce expenses to drawdown income and show the gap or the average expenses the pension can sustain. This would only make sense if that average was shown in present value.

### SEO
- "Educational Sandbox", "What if lab", "not a crystal ball", "Personbal Finance Lab", "Learn by doing, experimenting, and visualizing"
- Ask on reddit: What "what if" scenario are you most curious about running for your long term financial future?
- "Not affiliated with any financial institution"
- "It empowers you to ask those what if questions and see potential futures, visualized over decades, helps you think through the possibilities. Hopefully you gain valuable insights into your own financial future." 
- "Less overwhelmed by the sheer complexity of financial planning"
- Write blog posts, that explain how the simulator can help users answer their specific questions or model their own situation, maybe even linking to example scenarios.
   - About my history with finances, copy the ones I already sent as guest posts:
      - https://www.firedave.com/jorge-interview-retirement-simulator/
      - https://www.firedave.com/interview-2-jorge-dollar-cost-averaging-market-crash-stress-test/
   - Based on the answers to the reddit post, write blog posts about the most common scenarios.
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
- Event type para "gasto de unica vez" sin tener que poner dos veces el mismo año (y sin rate)
- Dar ejemplos de rate de real estate como hice con volatility
    - Para eso estaría bueno fetchear los datos de algún sitio, asignarlos a config y usar una variable

## Version 2 - "Web version"
- Move the urls from the help yaml to the config file and use variables in the yaml
- Review pension types (ChatGPT “Pension Types in Ireland”) 
- Add ability to fetch data from the web / google sheets

## Version 3 - "Modernize"
- Make things more generic so they apply to different systems (notepad "Generic Tax System").
- Move core (only premium features) to backend (initially my mac, then Google functions or AWS lambda), ideally with toggle to still run in the browser for dev.
- Reimplement the UI in React

## Version 4 - "Complete"
- Handle loss harvesting for trusts
- Did I consider debt (other than mortgage)?
- Add inflation volatility
- Add dividends and their tax
- Add a step function to represent government's delayed updates
- Add self-employed option, joint declaration, etc
- Change input system to capture the details needed for things like personal tax credits, benefits, etc.
- Show median age money ran out, 5 and 95% percentile.

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
- Add crypto because the laws in each country can be different for that (and let user select growth model - stock-to-flow, etc)
- Include features for calculating loan amortization, overpayments, and refinancing scenarios
- Add option to use historical data for the Monte Carlo simulation
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

