const pify = require('pify');
const kappa = require('kappa-core');
const levelup = require('levelup');
const memdown = require('memdown');
const ram = require('random-access-memory');
const hypercore = require('hypercore');

const DocumentsView = require('./documents');
const ItemsView = require('./items');

jest.setTimeout(1000);

describe('views.document', () => {
  let view;
  beforeEach(async () => {
    const db = levelup(memdown());
    const core = kappa(ram, { valueEncoding: 'json' });
    const feed = hypercore(ram, { valueEncoding: 'json' });

    await new Promise(resolve => feed.on('ready', resolve));

    const { key: publicKey } = feed;

    const asyncAppend = pify(feed.append.bind(feed));
    const append = async (data) => {
      return asyncAppend(data);
    };

    const isLocal = ({ author }) => author === publicKey.toString('hex');

    const itemsView = ItemsView('items', db, core, { append });
    view = DocumentsView('documents', db, core, { append, isLocal, author: publicKey });

    ['create', 'getById', 'init', 'appendChange', 'getChanges', 'onChange'].forEach((apiFn) => {
      view.api[`_${apiFn}`] = view.api[apiFn];
      view.api[apiFn] = async (...args) => view.api[`_${apiFn}`].apply(view.api, [core, ...args]);
    });

    core.use('items', itemsView);
    core.use('documents', view);
  });

  it('creates a document item', async () => {
    const item = await view.api.create({ type: 'documents', title: 'Test doc' });

    expect(item).toBeDefined();
    expect(item.itemId).toBeDefined();
    expect(item.title).toBe('Test doc');
  });
});
