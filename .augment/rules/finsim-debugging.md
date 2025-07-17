---
type: "agent_requested"
---

## DEBUGGING ##

When fixing an issue DO NOT jump to conclusions or start making sweeping changes based on absolutely no information. Don't do that. ALWAYS debug first. That means that you need to formulate 5 to 7 hypothesis, select the one or two most likely ones, add logging to confirm, and only when the root cause has been unequivocally proven through the logs, only then apply a fix, without removing the logs. Then test the fix by checking the logs. Once you have confirmed that you fixed the issue (as proven by the logs), only then remove the logs. Once that is done, you can declare that you fixed the issue. No sooner than that. DO NOT MAKE ASSUMPTIONS ABOUT THE CAUSE OF AN ISSUE. ALWAYS DEBUG!

A local webserver is always running, so there's never need to start a new one to. DO NOT ASK THE USER TO RUN A SERVER. IT'S ALWAYS ALREADY RUNNING!
