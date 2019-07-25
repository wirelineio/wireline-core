# Party Admission

Goal: Party authority Alice wants to add a new participant Bob to the party.

Note: Alice and Bob are identities, i.e. public keys.

* Alice sends Bob an out-of-party message (say, over email) with:
  * A proof (chain of signed proofs) that Alice is the party authority.
  * A credential (with expiry time) that authorizes Bob to join the party.
* Bob cryptographically verifies Alice's proof of authority.
* Bob connects to Alice's node and both sides verify each others identity:
  * TODO(ashwin): How does Bob connect exactly to Alice's node?
  * Bob sends Alice's node a nonce that must be signed using Alice's private key.
  * Alice sends Bob's node a nonce that must be signed using Bob's private key.
  * The signed nonces are verified by Alice and Bob using the others public key.
  * If verification fails, the connection is aborted.
* Bob sends Alice an ephemeral message with:
  * The credential that it received from Alice, and 
  * A feed key that Bob would like to add to the party.
* Alice verifies the credential presented by Bob.
* Alice replicates the feed from Bob (sparse replication works as Bob needs just the genesis block).
* Alice verifies the genesis block on the new feed:
  * Checks that the genesis block links back to Alice's feed (parent genesis block).
  * Checks that the feed genesis block is signed by Bob's private key.
  * The party key in the genesis block matches the party key in the credential.
  * The feed key in the genesis block matches the feed key.
  * If verification fails, the connection is aborted.
  * TODO(ashwin): Include credential in feed genesis block, else how can other peers verify Bob's membership?
* Alice MUST write the new feed key to their own feed in the party, to help others discover the set of feeds for the party.
  * TODO(ashwin): Define message to introduce new feed key.
  * Other peers do NOT treat this information as the truth. 
  * They perform their own verification of the feed genesis block, just like Alice did.
  * They MAY write the new feed key to their own feed in the party too.

## Proof of Party Authority

* Used to establish that an identity has authority in a party.
* Chain of signed proofs.
* Each proof in the chain is a signed feed genesis block.
* Each proof links to the previous proof (i.e., feed genesis block of the inviter).
* The chain terminates at the party genesis block.

TODO(ashwin): How to differentiate between different authority levels (owner, admin, write, read-only)?
