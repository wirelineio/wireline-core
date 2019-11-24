//
// Copyright 2019 Wireline, Inc.
//

import { Game } from './game';

test('game', () => {
  const game = new Game()
    .set('a1', 1)
    .set('a2', 0)
    .set('b3', 1)
    .set('b2', 0)
    .set('a3', 1)
    .set('c2', 0);

  console.log(game.ascii());

  expect(game.winner()).toEqual(0);
});
