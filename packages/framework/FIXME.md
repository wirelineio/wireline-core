# FIXME

## 06/25/19

- UML diagram
- must have 1 kappa for each party (multiplex to multifeed)
- framework must not have "current party"
- router must address party and view (item)


## 06/20/19

Related PRs:

- https://github.com/wirelineio/appkit/pull/2
  - apollo/react dependencies
  - use PartySerializer methods

- https://github.com/wirelineio/dsuite/pull/308
  - remove/tighten dependencies on dsuite object
  - use PartySerializer methods

Major changes:

- DSuite
  - getters for required private methods
  - consistent usage (e.g., dsuite.api => dsuite.core.api)
  - moved static methods to utils (e.g., uuid)
  - factored out logical components
    - PartyManager
    - PartySerializer (consistent serialize/deserialize methods => appkit)
  - views
    - removed dependencies on dsuite object
    - TODO(burdon): events (e.g., 'party-changed')
  - rules
    - moved to ./parties directory (with other party related code)
    - removed dependencies on dsuite object
    - return rule objects that are processed by dsuite.initialize

Before merge:

- coordinate with other PRs (above).
- test breaking changes for BotKit, etc.

Next:

- factor out dsuite-core (move to appkit?)
- remove core => kappa => core dependency (see appkit for PartySerializer)
- swarm constructor (factor out debug and move constructor into dsuite); move to mega or separate package?
- move appkit/party to dsuite-core (and all stores!)
- dsuite events (consistency/documented; move out of views)
  - dsuite.metrics events
- rename dsuite (framework?)
- rename dsuite.core => kappa
- console.log => debug
- remove @wirelineio/utils
- consistent use of keys (hex/buffer)
  - Megafeed.keyToBuffer (utils)
  - consistent bufferFrom

Style Discussion:
- babel
- CHANGEME.md file
- use @type comments (e.g., {{ foo }) to describe complex objects (e.g., dsuite)
- flatname, camelCase, hyphen or underscore for multi-part file names
- exporting funcitons vs. classes
- monolithic objects (vs. tightly defined objects with tests); "core" is not a valid abstraction
- class dependencies should be a DAG (e.g., not core => kappa => core)
