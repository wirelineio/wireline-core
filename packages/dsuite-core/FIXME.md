# Refactoring

1. babel
1. remove "dsuite" (and "core"); candidates: "framework"
1. CHANGEME.md file


# Potentially Breaking Changes (e.g., bots, sdk)

dsuite.api => dsuite.core.api (deprecated)
dsuite.uuid => utils/uuid




# TODO

- rename "dsuite"
- dsuite deps:

rules/bots.js
- conf
- currentPartyKey
- connectToParty
- swarm.leave

rules/documents.js
- conf
- core.api
- mega
- getLocalPartyFeed
- getPartyName

/bot.js (RENAME)
- initialize
- mega

view/contacts.js
- mega.key

view/documents.js
- core.api
- emit (metrics)
- getPartyByItemId
- getPartyKeyFromFeedKey

view/items.js
- on('party-changed')
- getLocalPartyFeed
- getPartyKeyFromFeedKey

view/logs.js
- db
- core.api
- isLocal
- getPartyKeyFromFeedKey

view/participants.js
- on('party-changed')
- db
- mega
- core.api
- getLocalPartyFeed

// dsuite

apollo.js
- hasView
- registerView
- core
- initialize
- mega
- currentPartyKey

metrics
- on
- mega.ready
- api
- swarm








