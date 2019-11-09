//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'hypercore-crypto';
import ram from 'random-access-memory';

import swarm from '@wirelineio/discovery-swarm-memory';
import { Framework } from '@wirelineio/framework';

import { ObjectModel } from './object';
import { LogViewAdapter } from './view';
import { MutationProtoUtil, KeyValueProtoUtil } from './mutation';

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

// TODO(burdon): Is there something standard that does this?
const waitForUpdate = async (model, count = 1) => {
  return new Promise((resolve) => {
    const listener = () => {
      if (--count <= 0) {
        model.removeListener('update', listener);
        resolve();
      }
    };

    model.on('update', listener);
  });
};

test('mutations', async () => {
  const partyKey = crypto.randomBytes(32);
  const partitionId = 'partition-1';
  const objectType = 'card';

  const f1 = await createFramework(partyKey, 'peer-1');
  const f2 = await createFramework(partyKey, 'peer-2');

  const view1 = await LogViewAdapter.createView(f1, partitionId);
  const view2 = await LogViewAdapter.createView(f2, partitionId);

  const model1 = new ObjectModel().connect(view1);
  const model2 = new ObjectModel().connect(view2);

  expect(model1.getObjects(objectType)).toHaveLength(0);
  expect(model2.getObjects(objectType)).toHaveLength(0);

  const objects = [
    {
      id: ObjectModel.createId(objectType),
      properties: {
        title: 'Card 1'
      }
    },
    {
      id: ObjectModel.createId(objectType),
      properties: {
        title: 'Card 2',
        priority: 2
      }
    },
    {
      id: ObjectModel.createId(objectType),
      properties: {
        title: 'Card 3',
        priority: 1
      }
    }
  ];

  // Create objects.
  {
    const mutations = ObjectModel.fromObjects(objects);
    await model1.commitMutations(mutations);

    await waitForUpdate(model2);
    expect(model2.getObjects(objectType)).toHaveLength(objects.length);
    for (const object of objects) {
      expect(model2.objects.get(object.id)).toEqual(object);
    }
  }

  // Update object.
  {
    expect(model1.objects.get(objects[1].id).properties.priority).toEqual(2);

    const mutations = [
      MutationProtoUtil.createMessage(objects[1].id, KeyValueProtoUtil.createMessage('priority', 3))
    ];
    await model2.commitMutations(mutations);

    await waitForUpdate(model1);
    expect(model1.objects.get(objects[1].id).properties.priority).toEqual(3);
  }

  // TODO(burdon): Test delete.
});
