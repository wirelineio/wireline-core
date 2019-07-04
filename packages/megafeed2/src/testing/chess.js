//
// Copyright 2019 Wireline, Inc.
//

import pify from 'pify';
import { Chess } from 'chess.js';

import { keyName } from '../util/keys';

export class ChessStateMachine {

  static WHITE = 'white';
  static BLACK = 'black';

  constructor(gameId, options = {}) {
    this._gameId = gameId;
    this._initialized = false;
    this._game = new Chess(options.fen);
  }

  toString() {
    const meta = {
      gameId: keyName(this._gameId),
      fen: this._game.fen()
    };

    return `Chess(${JSON.stringify(meta)})`;
  }

  setPlayers(white, black) {
    console.assert(white);
    console.assert(black);

    this._white = white;
    this._black = black;
    this._initialized = true;
  }

  get players() {
    return {
      white: this._white,
      black: this._black
    }
  }

  get gameId() {
    return this._gameId;
  }

  get initialized() {
    return this._initialized;
  }

  get position() {
    return this._game.fen();
  }

  get moves() {
    return this._game.history({ verbose: true }).map((move, seq) => {
      return {
        seq,
        from: move.from,
        to: move.to
      }
    });
  }

  get length() {
    return this._game.history().length;
  }

  get turn() {
    return {
      toPlay: this._game.turn() === 'w' ? ChessStateMachine.WHITE : ChessStateMachine.BLACK,
      seq: this.length
    }
  }

  applyMove({ seq, from, to }) {
    console.assert(seq >= 0);
    console.assert(from);
    console.assert(to);

    if (!this._initialized) {
      throw new Error('Not initialized.');
    }

    const { seq: expectedSeq } = this.turn;
    if (seq !== expectedSeq) {
      throw new Error(`Invalid move sequence. Expected ${expectedSeq}, got ${seq}.`);
    }

    this._game.move({ from, to });
  }
}

export class ChessApp {

  static TYPE = 'wrn:type:wireline.io/chess';

  // Messages are always in the context of the TYPE.
  static MOVE_MSG = 'move';
  static GAME_MSG = 'game';

  constructor(feed, view, itemId) {
    console.assert(feed);
    console.assert(view);
    console.assert(itemId);

    this._feed = feed;
    this._view = view;
    this._itemId = itemId;
    this._state = new ChessStateMachine(this._itemId);
    this._view.events.on('update', this._handleViewUpdate.bind(this));
  }

  async createGame(whitePlayerKey, blackPlayerKey) {
    await pify(this._feed.append.bind(this._feed))({
      type: ChessApp.TYPE,
      msgType: ChessApp.GAME_MSG,
      itemId: this._itemId,
      whitePlayerKey,
      blackPlayerKey
    });
  }

  async addMove({ seq, from, to }) {
    await pify(this._feed.append.bind(this._feed))({
      type: ChessApp.TYPE,
      itemId: this._itemId,
      seq,
      msgType: ChessApp.MOVE_MSG,
      from,
      to
    });
  }

  getPlayerKey(color) {
    return this._state.players[color];
  }

  get moves() {
    return this._state.moves;
  }

  get position() {
    return this._state.position;
  }

  _handleViewUpdate(itemId) {
    if (this._itemId !== itemId) {
      return;
    }

    const logs = this._view.logsByItemId(this._itemId);
    if (!this._state.initialized) {
      return this._initGame(logs);
    }

    return this._applyMoves(logs);
  }

  _initGame(logs) {
    // See if we have a game message.
    const gameMessages = logs.filter(obj => obj.msgType === ChessApp.GAME_MSG);
    console.assert(gameMessages.length <= 1);

    if (!gameMessages.length) {
      return;
    }

    const [{ whitePlayerKey, blackPlayerKey }] = gameMessages;
    this._state.setPlayers(whitePlayerKey, blackPlayerKey);
  }

  _applyMoves(logs) {
    const moves = logs
      .filter(obj => obj.msgType === ChessApp.MOVE_MSG)
      .sort((a, b) => a.seq - b.seq);

    let expectedSeq = this._state.turn.seq;
    while(expectedSeq < moves.length && moves[expectedSeq].seq === expectedSeq) {
      // TODO(ashwin): Check if player is allowed to move.
      this._state.applyMove(moves[expectedSeq]);
      expectedSeq = this._state.turn.seq;
    }
  }
}
