//
// Copyright 2019 Wireline, Inc.
//

import { Game } from './game';

test('game', () => {
  const game = new Game()
    .set('a1', 'o')
    .set('a2', 'x')
    .set('b3', 'o')
    .set('b2', 'x')
    .set('a3', 'o')
    .set('c2', 'x');

  console.log(game.ascii());

  expect(game.winner()).toEqual('x');
});
