//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { Chess } from 'chess.js';

import { keyName } from '../../util/keys';
import { ItemStateMachine } from '../app/item';

import { ChessProto } from './chess_proto';

const log = debug('chess');

/**
 * App state machine.
 */
export class ChessStateMachine {

  // TODO(burdon): Reference WRN docs: https://github.com/wirelineio/specs/blob/master/WRN.md
  static TYPE = 'wrn:type:wireline.io/chess';

  // TODO(burdon): Remove static methods: factor out abstraction to create items.
  static async createItem(megafeed, userKey) {

    // TODO(burdon): Create item credential.
    const item = await ItemStateMachine.createItem(ChessStateMachine.TYPE, userKey);
    await megafeed.append(item);

    // TODO(burdon): Subscription.
    return new ChessStateMachine(megafeed, item.key);
  }

  // TODO(burdon): Should not be passed a megafeed. Instead should register subscription?
  constructor(megafeed, key) {
    this._megafeed = megafeed;
    this._key = key;

    this._game = new Chess();

    // TODO(burdon): Live vs replay? How is the FSM instantiated?
    this._subscription = this._megafeed.createSubscription({
      sort: 'ts',
      callback: ({ messages }) => {
        log('updated: ' + messages.length);
      }
    });
  }

  toString() {
    const meta = {
      key: keyName(this._key),
      fen: this._game.fen()
    };

    return `Chess(${JSON.stringify(meta)})`;
  }

  get key() {
    return this._key;
  }

  get game() {
    return this._game;
  }

  // TODO(burdon): Write credential.
  async setPlayers({ white, black }) {
    const game = ChessProto.Game.create({ white, black });

    await this._megafeed.append(game);

    return game;
  }

  // TODO(burdon): Validate credentials and add move number.
  async addMove({ from, to }) {
    const move = ChessProto.Move.create({ from, to });

    await this._megafeed.append(move);

    return move;
  }
}
