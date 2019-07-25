//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import { Writable, Readable } from 'stream';
import { Chess } from 'chess.js';
import pump from 'pump';

import { random } from '../util/debug';

import messages from './messages';

debug.enable('test');

// const log = debug('test');

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

    this._stream = new Writable({
      objectMode: true,
      write: this._write.bind(this)
    });
  }

  get stream() {
    return this._stream;
  }

  get initialized() {
    return this._white && this._black;
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
   * Stream write method (https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback_1).
   * @param {Object} chunk
   * @param {string} encoding
   * @param {Function} callback
   * @private
   */
  _write(chunk, encoding, callback) {
    console.assert(chunk);
    console.assert(encoding);
    console.assert(callback);

    const { type, message } = chunk;
    console.assert(type);
    console.assert(message);

    switch (type) {
      case 'wrn:chess/new_game': {
        this._initGame(message);
        break;
      }

      case 'wrn:chess/move': {
        this._applyMove(message);
        break;
      }
    }

    callback();

    if (this.gameOver) {
      return this._stream.end();
    }
  }

  /**
   * Init the game.
   * @param {Object} message
   * @private
   */
  _initGame(message) {
    const { white, black } = message;
    this._white = white;
    this._black = black;
  }

  /**
   * Apply move.
   * @param {Object} message
   * @private
   */
  _applyMove(message) {
    if (!this.initialized) {
      throw new Error('Game not initialized.');
    }

    this._game.move(message);
  }
}

/**
 * Feeds a chess state machine with inputs.
 */
class ChessFeeder {

  _gameInitialized = false;
  _expectedMoveSeq = 0;
  _buffer = [];

  /**
   * @constructor
   * @param {string} itemKey
   */
  constructor(itemKey) {
    this._itemKey = itemKey;
    this._stream = new Readable({
      objectMode: true,
      read() {}
    });
  }

  get stream() {
    return this._stream;
  }

  /**
   * Add a message.
   * @param {Object} obj
   */
  addMessage(obj) {
    console.assert(obj);

    const { message } = obj;
    console.assert(message);
    if (message.itemKey !== this._itemKey) {
      return;
    }

    this._buffer.push(obj);
    this._processBuffer();
  }

  /**
   * Process the buffer of messages.
   * @private
   */
  _processBuffer() {
    if (!this._gameInitialized) {
      // Try to find a new game message.
      const gameObj = this._buffer.find(obj => obj.type === 'wrn:chess/new_game');
      if (gameObj) {
        this._gameInitialized = true;
        this._buffer = this._buffer.filter(obj => obj !== gameObj);
        this._stream.push(gameObj);
      }
    }

    // While the buffer has messages that match what we need, keep processing them.
    while (this._gameInitialized && this._buffer.length) {
      const moveObj = this._buffer.find(obj => obj.type === 'wrn:chess/move' && obj.message.seq === this._expectedMoveSeq);
      if (!moveObj) {
        // Expected move seq not found, can't continue.
        break;
      }

      this._buffer = this._buffer.filter(obj => obj !== moveObj);
      this._expectedMoveSeq++;
      this._stream.push(moveObj);
    }
  }
}

test('chess state machine', async (done) => {
  const chessFeeder = new ChessFeeder('wrn:item:game1');
  const game1 = new ChessStateMachine('wrn:item:game1');

  pump(chessFeeder.stream, game1.stream, (err) => {
    expect(err).toBeUndefined();
    expect(game1.meta).toEqual({ white: 'kasparov', black: 'karpov' });
    expect(game1.position).toBe('rnbqkbnr/ppp2ppp/8/3pp3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6 0 3');

    done();
  });

  random.shuffle(messages).forEach(message => {
    chessFeeder.addMessage(message);
  });
});
