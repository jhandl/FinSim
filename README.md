# Roadmap


## Version 2
- Add a step function to represent government's delayed updates
- Review pension types and minimum retirement ages (ChatGPT “Pension Types in Ireland”) 
- Add a way to view and override config settings (like DD)
- Add a link to FinSim.ie in the spreadsheet
- Add ability to fetch data from the web / google sheets
- Produce a log of what happened over the years (bought "cuba", sold ETF for $x, couldn't cover expenses, etc)
- Analyse the log with LLM to produce a summary of what happened and maybe some recommendations


## Version 3
- Move core to backend (Google functions or AWS lambda), ideally with toggle to still run in the browser for dev.
- Reimplement the UI in React
- Make things more generic so they apply to different systems


## Version 4
- Add dividends and their tax
- Add countries and a way to select a country
- Add an event to move to a country
- Add a way for an AI agent to research a country and generate the config file for it
- Add a way to have EA and GA so people can test before it goes out to everyone
- Add campaigns to CIO to let people of a country know they have a new version to test (use API so it goes out as soon as the AI made changes)
- Add crypto because the laws in each country can be different for that (and let user select growth model - stock-to-flow, etc)
- Add some way to limit the basic features and create tiered plans for the rest
- Integrate with payments provider
- Add a chat box - Intercom?

