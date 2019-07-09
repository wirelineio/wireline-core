//
// Copyright 2019 Wireline, Inc.
//

import debug from 'debug';
import pify from 'pify';
import { Chess } from 'chess.js';

import { keyName } from '../util/keys';

const log = debug('chess');

/**
 * Chess state machine.
 */
export class ChessStateMachine {

  static WHITE = 'white';
  static BLACK = 'black';

  // Consider the game drawn if no captures have been made recently (in 'N' moves).
  static MAX_NO_CAPTURE_NUM_MOVES = 5;

  // MAX_NO_CAPTURE_NUM_MOVES kicks in only after MIN_GAME_MOVES moves have been made in the game.
  static MIN_GAME_MOVES = 20;

  /**
   * @constructor
   * @param {String} gameId
   * @param {Object} options
   */
  constructor(gameId, options = {}) {
    this._gameId = gameId;
    this._initialized = false;
    this._game = new Chess(options.fen);
  }

  get meta() {
    return {
      gameId: this._gameId,
      white: this._white,
      black: this._black
    }
  }

  get initialized() {
    return this._initialized;
  }

  get position() {
    return this._game.fen();
  }

  get gameMoves() {
    return this._game.history({ verbose: true }).map((move, seq) => {
      return {
        seq,
        from: move.from,
        to: move.to
      }
    });
  }

  get legalMoves() {
    return this._game.moves({ verbose: true });
  }

  get gameOver() {
    return this._game.game_over() || this.noRecentCapture();
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

  toString() {
    const meta = {
      gameId: keyName(this._gameId),
      fen: this._game.fen()
    };

    return `Chess(${JSON.stringify(meta)})`;
  }

  /**
   * Check that game doesn't have a recent capture.
   * @returns {boolean}
   */
  noRecentCapture() {
    const moves = this._game.history({ verbose: true });
    if (moves.length <= ChessStateMachine.MIN_GAME_MOVES) {
      return false;
    }

    let lastFewMoves = moves.splice(moves.length - ChessStateMachine.MAX_NO_CAPTURE_NUM_MOVES);
    const captureMoves = lastFewMoves.filter(move => move.captured);

    return captureMoves.length === 0;
  }

  /**
   * Initialize game.
   * @param {String} white - identity of White player.
   * @param {String} black - identity of Black player.
   */
  initGame({ white, black }) {
    console.assert(white);
    console.assert(black);

    this._white = white;
    this._black = black;
    this._initialized = true;
  }

  /**
   * Apply a move.
   * @param {Number} seq
   * @param {String} from
   * @param {String} to
   * @param {String} [promotion]
   */
  applyMove({ seq, from, to, promotion }) {
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

    this._game.move({ from, to, promotion });
  }
}

/**
 * Chess App.
 */
export class ChessApp {

  static TYPE = 'chess';

  // Messages are always in the context of the TYPE.
  static MOVE_MSG = 'chess.Move';
  static GAME_MSG = 'chess.Game';

  /**
   * @constructor
   * @param {Hypercore} feed
   * @param {Object} view
   * @param {String} itemId
   * @param {Codec} codec
   */
  constructor(feed, view, itemId, codec) {
    console.assert(feed);
    console.assert(view);
    console.assert(itemId);
    console.assert(codec);

    this._feed = feed;
    this._view = view;
    this._itemId = itemId;
    this._codec = codec;
    this._state = new ChessStateMachine(this._itemId);
    this._view.events.on('update', this._handleViewUpdate.bind(this));
  }

  get moves() {
    return this._state.gameMoves;
  }

  get position() {
    return this._state.position;
  }

  get gameOver() {
    return this._state.gameOver;
  }

  get meta() {
    return this._state.meta;
  }

  get nextMoveNum() {
    return this._state.turn.seq;
  }

  // Play a (random) move in the game.
  async playMove() {
    const seq = this._state.turn.seq;

    const legalMoves = this._state.legalMoves;
    const { from, to, promotion } = legalMoves[Math.floor(Math.random() * legalMoves.length)];

    await this.addMove({ seq, from, to, promotion });
  }

  /**
   * Create a game.
   * @param {String} whitePlayerKey
   * @param {String} blackPlayerKey
   * @returns {Promise<void>}
   */
  async createGame({ whitePlayerKey, blackPlayerKey }) {
    const gameMessage = {
      type: ChessApp.GAME_MSG,
      message: {
        itemId: this._itemId,
        whitePlayerKey,
        blackPlayerKey
      }
    };

    await pify(this._feed.append.bind(this._feed))(this._codec.encode(gameMessage));

    log(`New game ${keyName(this._itemId)}: ${keyName(this._feed.key)} created the game.`);
  }

  /**
   * Add a move.
   * @param seq
   * @param from
   * @param to
   * @param [promotion]
   * @returns {Promise<void>}
   */
  async addMove({ seq, from, to, promotion }) {
    const moveMessage = {
      type: ChessApp.MOVE_MSG,
      message: {
        itemId: this._itemId,
        seq,
        from,
        to,
        promotion
      }
    };

    await pify(this._feed.append.bind(this._feed))(this._codec.encode(moveMessage));

    log(`Game ${keyName(this._itemId)}: ${keyName(this._feed.key)} played move #${seq + 1}.`);
  }

  /**
   * Handle view update event.
   * @param {String} itemId
   * @returns {void|*}
   * @private
   */
  _handleViewUpdate(itemId) {
    // Only handle updates if they're for our itemId.
    if (this._itemId !== itemId) {
      return;
    }

    const itemLogs = this._view.logsByItemId(this._itemId);
    if (!this._state.initialized) {
      return this._initGame(itemLogs);
    }

    return this._applyMoves(itemLogs);
  }

  /**
   * Init game.
   * @param itemLogs
   * @private
   */
  _initGame(itemLogs) {
    // See if we have a game message.
    const gameMessages = itemLogs.filter(obj => obj.type === ChessApp.GAME_MSG);
    console.assert(gameMessages.length <= 1);
    if (!gameMessages.length) {
      return;
    }

    const [{ message: { whitePlayerKey, blackPlayerKey } }] = gameMessages;
    this._state.initGame({ white: whitePlayerKey, black: blackPlayerKey });
  }

  /**
   * Apply moves.
   * @param itemLogs
   * @private
   */
  _applyMoves(itemLogs) {
    const moves = itemLogs
      .filter(obj => obj.type === ChessApp.MOVE_MSG)
      .sort((a, b) => a.message.seq - b.message.seq);

    let expectedSeq = this._state.turn.seq;

    // Update state machine as long as the next seq (move number) expected by the state machine is:
    // (1) found in the log and (2) found in the correct order.
    // This ensures we don't apply moves in invalid order.
    while (expectedSeq < moves.length && moves[expectedSeq].message.seq === expectedSeq) {
      // TODO(ashwin): Check if player is allowed to move.
      this._state.applyMove(moves[expectedSeq].message);
      expectedSeq = this._state.turn.seq;
    }
  }
}
