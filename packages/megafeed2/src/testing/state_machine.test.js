//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { Chess } from 'chess.js';
import waitForExpect from 'wait-for-expect';

debug.enable('test');

const log = debug('test');

/**
 * Chess game generator.
 * @param {Object} store
 * @param {string} itemKey
 * @return {IterableIterator<*>}
 */
function* chessGameGenerator(store, itemKey) {
  let isGameInitialized = false;
  let nextSeq = 0;

  while (!isGameInitialized) {
    // Check if store has a new game message.
    if (store['wrn:chess/new_game'] &&
      store['wrn:chess/new_game'][itemKey]) {
      yield store['wrn:chess/new_game'][itemKey][0];

      // Break out of the loop.
      isGameInitialized = true;
      break;
    }

    log('Game message not found.');
    // TODO(ashwin): Returning from the generator ends it. How do we wait for the new game message? Promises?
    return;
  }

  // Return moves in sequence.
  while (true) {
    const moveMessages = store['wrn:chess/move'][itemKey];
    const nextMove = moveMessages.find(moveMsg => moveMsg.message.seq === nextSeq);

    if (!nextMove) {
      // TODO(ashwin): Returning from the generator ends it. Don't yet have the move, how do we wait? Promises?
      log('No move found with seq', nextSeq);
      return;
    }

    // TODO(ashwin): How do generators, in general (e.g. when not using seq numbers),
    // TODO(ashwin): keep track of the messages they've already processed from the store?

    nextSeq++;
    const abort = yield nextMove;
    if (abort) {
      // Game has ended, break the loop.
      break;
    }
  }
}

/**
 * Chess State Machine.
 */
class ChessStateMachine {

  // Consider game drawn after 'N' number of moves.
  static MAX_MOVES = 4;

  _white = null;
  _black = null;

  _game = new Chess();

  /**
   * @constructor
   * @param {string} itemKey
   */
  constructor(itemKey) {
    console.assert(itemKey);
    this._itemKey = itemKey;
  }

  get itemKey() {
    return this._itemKey;
  }

  get gameOver() {
    return this._game.history().length >= ChessStateMachine.MAX_MOVES;
  }

  get position() {
    return this._game.fen();
  }

  get meta() {
    return {
      white: this._white,
      black: this._black
    }
  }

  /**
   * Handle chess message.
   * @param {Object} msg
   */
  onMessage(msg) {
    console.assert(msg);

    const { value } = msg;
    if (!value) {
      return;
    }

    switch (value.type) {
      case 'wrn:chess/new_game': {
        const { white, black } = value.message;
        this._white = white;
        this._black = black;
        break;
      }

      case 'wrn:chess/move': {
        this._game.move(value.message);
        break;
      }
    }
  }
}

/**
 * View.
 * @param {Object} store
 * @param {Object} stateMachine
 * @param {GeneratorFunction} generator
 */
const view = (store, stateMachine, generator) => {
  console.assert(store);
  console.assert(stateMachine);
  console.assert(generator);

  // TODO(ashwin): Can views get the query spec from the state machine?
  // TODO(ashwin): How do views process new data (i.e. store getting updated)?
  const iterator = generator(store, stateMachine.itemKey);
  let msg = iterator.next();
  while (!msg.done) {
    stateMachine.onMessage(msg);
    msg = iterator.next(stateMachine.gameOver);
  }
};

test('chess state machine / view / generator', async () => {

  // Indexed data seen on feeds (so far).
  const store = {
    'wrn:chess/new_game': {
      'wrn:item:game1': [
        {
          type: 'wrn:chess/new_game',
          message: {
            white: 'kasparov',
            black: 'karpov'
          }
        }
      ]
    },
    'wrn:chess/move': {
      // Note: Moves are out of order.
      'wrn:item:game1': [
        {
          type: 'wrn:chess/move',
          message: {
            seq: 1,
            from: 'e7',
            to: 'e5'
          }
        },
        {
          type: 'wrn:chess/move',
          message: {
            seq: 0,
            from: 'e2',
            to: 'e4'
          }
        },
        {
          type: 'wrn:chess/move',
          message: {
            seq: 3,
            from: 'd7',
            to: 'd5'
          }
        },
        {
          type: 'wrn:chess/move',
          message: {
            seq: 2,
            from: 'd2',
            to: 'd4'
          }
        }
      ]
    }
  };

  const game1 = new ChessStateMachine('wrn:item:game1');
  view(store, game1, chessGameGenerator);

  await waitForExpect(() => {
    expect(game1.meta).toEqual({ white: 'kasparov', black: 'karpov' });
    expect(game1.position).toBe('rnbqkbnr/ppp2ppp/8/3pp3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6 0 3');
  });
});
