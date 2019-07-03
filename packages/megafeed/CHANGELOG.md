# Change Log

Discussion: 06/19/19 (Max, Martin, Rich)

https://github.com/wirelineio/wireline-core/pull/23/files#diff-06ed5b377313d9ea7a0ebd99b94a1b80

CONCEPTS

- _feeds => _feedMap of ({ meta, feed }) objects (removing all pify methods from hypercore and pseudo properties)
- factor out feed factory from FeedMap; simplifies the different "opts" params and removes storage being passed into FeedMap
- adapter class that uncouples FeedMap from Kappa (Martin: Note this removes the need for the silent option for serialize/deserialize in dsuite-core)
- rethink initFeeds method so that there are no special "startup" cases
- rethink FeedMap caching (i.e., remove the "loaded" flag); instead make FeedMap dumb and consider Party maintaining set of "loaded" feeds)
- remove "persist" options (assume for now all feeds are persisted)
- don't require "feed" name. If not specified is null. i.e., "name" is just an index and the caller can choose to query by name or key
- consistent use of keys (i.e., leave as Buffer and only convert to string for Map keys)
- attempt to remove Locker (semaphore)
- rethink exception handling/logging (e.g., let exceptions escape--except to cleanup; exceptions are part of the API)

STYLE

- use babel
- toString (meta) pattern
- remove all defensive checks (e.g., console.assert early).
- move away from ({ a, b, c }) pattern for REQUIRED params only.

TO DISCUSS

- Move party into megafeed
