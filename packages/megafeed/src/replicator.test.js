//
// Copyright 2019 Wireline, Inc.
//

import crypto from 'crypto';

import ram from 'random-access-memory';
import hypertrie from 'hypertrie';
import generator from 'ngraph.generators';
import pify from 'pify';
import pump from 'pump';
import waitForExpect from 'wait-for-expect';
import eos from 'end-of-stream';

import { FeedStore } from '@dxos/feed-store';

import { Protocol } from '@wirelineio/protocol';

import { Replicator } from '.';

jest.setTimeout(30000);

const createNode = async (topic) => {
  const feedStore = await FeedStore.create(hypertrie(ram), ram, { valueEncoding: 'utf8' });
  const replicator = new Replicator(feedStore);
  const feed = await feedStore.openFeed('/feed', { metadata: { topic: topic.toString('hex') } });
  const append = pify(feed.append.bind(feed));

  return {
    getFeeds() {
      return feedStore.getFeeds();
    },
    replicate(options) {
      return new Protocol(options)
        .setExtensions([replicator.createExtension()])
        .init(topic)
        .stream;
    },
    append(msg) {
      return append(msg);
    },
    getMessages() {
      const messages = [];
      const stream = feedStore.createReadStream();
      stream.on('data', (data) => {
        messages.push(data.toString('utf8'));
      });
      return new Promise((resolve, reject) => {
        eos(stream, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(messages.sort());
          }
        });
      });
    }
  };
};

const createPeers = async (topic, graph) => {
  const peers = [];
  graph.forEachNode((node) => {
    peers.push(node);
  });

  await Promise.all(peers.map(async (node) => {
    node.data = await createNode(topic);
  }));
};

const createConnections = (graph) => {
  const options = {
    streamOptions: {
      live: true
    }
  };

  graph.forEachLink((link) => {
    const fromNode = graph.getNode(link.fromId).data;
    const toNode = graph.getNode(link.toId).data;
    const r1 = fromNode.replicate(options);
    const r2 = toNode.replicate(options);
    link.data = pump(r1, r2, r1, (err) => {
      if (err) {
        console.error(err);
      }
    });
  });
};

describe('test data replication in a balanced network graph of 15 peers', () => {
  const topic = crypto.randomBytes(32);
  let graph;

  beforeAll(async () => {
    graph = generator.balancedBinTree(3);
    await createPeers(topic, graph);
    createConnections(graph);
  });

  test('feed synchronization', async () => {
    expect.assertions(15);

    await waitForExpect(() => {
      graph.forEachNode((node) => {
        expect(node.data.getFeeds().length).toBe(graph.getNodesCount());
      });
    }, 4500, 1000);
  });

  test('message synchronization', async () => {
    expect.assertions(15);

    const messages = [];
    const wait = [];
    graph.forEachNode((node) => {
      const msg = `${node.id}:foo`;
      wait.push(node.data.append(msg));
    });
    messages.sort();
    await Promise.all(wait);

    await waitForExpect(async () => {
      const results = [];
      graph.forEachNode((node) => {
        results.push(node.data.getMessages());
      });
      for await (const nodeMessages of results) {
        expect(nodeMessages).toEqual(nodeMessages);
      }
    }, 4500, 1000);
  });
});
