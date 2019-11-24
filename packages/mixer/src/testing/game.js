//
// Copyright 2019 Wireline, Inc.
//

const lines = [
  ['a1', 'a2', 'a3'],
  ['b1', 'b2', 'b3'],
  ['c1', 'c2', 'c3'],

  ['a1', 'b1', 'c1'],
  ['a2', 'b2', 'c2'],
  ['a3', 'b3', 'c3'],

  ['a1', 'b2', 'c3'],
  ['a3', 'b2', 'c1'],
];

export const GameBuilder = (bucketId, position, piece) => ({
  bucketId,
  payload: {
    __type_url: '.testing.Game',
    position,
    piece
  }
});

/**
 * Noughts-and-crosses game.
 */
export class Game {

  _move = 0;
  _state = [...new Array(3)].map(() => [...new Array(3)]);

  ascii() {
    const rows = [];
    const pieces = 'ox';
    this._state.forEach((row, i) => {
      rows.push(row.map((c => (c === undefined ? ' ' : pieces[c]))).join('|'));
      if (i < 2) {
        rows.push('-+-+-');
      }
    });

    return rows.join('\n');
  }

  isOver() {
    return this._move === 9 || this.winner();
  }

  winner() {
    let winner;
    lines.forEach((line) => {
      const count = [0, 0];

      line.forEach((position) => {
        const { row, column } = this.position(position);
        const piece = this._state[row][column];
        if (piece !== undefined) {
          count[piece]++;
        }
      });

      count.forEach((value, i) => {
        if (value === 3) {
          winner = i;
        }
      });
    });

    return winner;
  }

  position(position) {
    if (position.length !== 2) {
      throw new Error(`Illegal move: ${position}`);
    }

    const row = 'abc'.indexOf(position[0]);
    const column = '123'.indexOf(position[1]);

    if (row === -1 || column === -1) {
      throw new Error(`Illegal move: ${position}`);
    }

    return { row, column };
  }

  // TODO(burdon): CRDT: reference previous move.
  set(position, piece) {
    const { row, column } = this.position(position);
    const current = this._state[row][column];
    if (current) {
      throw new Error(`Illegal move: ${position}`);
    }

    if (piece !== 0 && piece !== 1) {
      throw new Error(`Illegal piece: ${piece}`);
    }

    this._state[row][column] = piece;
    this._move++;

    return this;
  }
}
