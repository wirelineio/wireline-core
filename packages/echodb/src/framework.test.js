//
// Copyright 2019 Wireline, Inc.
//

import { EventEmitter } from 'events';
import crypto from 'hypercore-crypto';
import ram from 'random-access-memory';
import waitForExpect from 'wait-for-expect';

import swarm from '@wirelineio/discovery-swarm-memory';
import { Framework } from '@wirelineio/framework';

import { ObjectModel } from '.';

// TODO(burdon): Functions should take parameters not objects (e.g., viewManager.registerView).
// TODO(burdon): Well-formed objects in constructor (no async).
// TODO(burdon): Review log protocol (e.g., rename "changes" to messages).

// TODO(burdon): Peer object?
const createFramework = async (partyKey, name) => {
  const framework = new Framework({
    partyKey,
    name,
    keys: crypto.keyPair(),
    swarm,
    storage: ram
  });

  return framework.initialize();
};

// TODO(burdon): Adapter to provide API similar to apollo-kappa-link withLogView HOC.
class LogViewAdapter extends EventEmitter {

  /**
   * @param view - LogsView
   * @param itemId
   */
  constructor(view, itemId) {
    super();
    console.assert(view);
    console.assert(itemId);

    this._view = view;
    this._itemId = itemId;

    this._log = [];
    this._view.onChange(itemId, (log) => {
      const { changes } = log;
      this._log = changes;

      this.emit('update', this._log);
    });
  }

  get log() {
    return this._log;
  }

  async getLog() {
    return this._view.getLogs(this._itemId);
  }

  async appendMutations(mutations) {
    for (const mutation of mutations) {
      await this._view.appendChange(this._itemId, mutation);
    }
  }
}

const createView = async (framework, viewName, itemId) => {

  // Creates a LogsView instance.
  framework.viewManager.registerView({ name: viewName });

  return new LogViewAdapter(framework.kappa.api[viewName], itemId);
};

test('basic views', async () => {
  const partyKey = crypto.randomBytes(32);

  const viewType = 'test';
  const itemId = 'item-1';

  const f1 = await createFramework(partyKey, 'peer-1');
  const f2 = await createFramework(partyKey, 'peer-2');

  const view1 = await createView(f1, viewType, itemId);
  const view2 = await createView(f2, viewType, itemId);

  const model1 = new ObjectModel();
  const model2 = new ObjectModel();

  view1.on('update', log => model1.applyLog(log));
  view2.on('update', log => model2.applyLog(log));

  const type = 'card';

  const items = [
    {
      id: ObjectModel.createId(type),
      properties: {
        title: 'Card 1'
      }
    },
    {
      id: ObjectModel.createId(type),
      properties: {
        title: 'Card 2',
        priority: 2
      }
    },
    {
      id: ObjectModel.createId(type),
      properties: {
        title: 'Card 3',
        priority: 1
      }
    }
  ];

  const mutations = ObjectModel.fromObjects(items);

  await view1.appendMutations(mutations);

  // TODO(burdon): Wait for something else (e.g., replication to complete)? Waits for 7s.
  await waitForExpect(async () => {
    return Promise.all([
      expect(await view1.getLog()).toHaveLength(mutations.length),
      expect(await view2.getLog()).toHaveLength(mutations.length),
    ]);
  });

  {
    const items = model2.getObjects(type);
    expect(items).toHaveLength(items.length);

    expect(model2.objects.get(items[0].id)).toEqual(items[0]);
  }
});
