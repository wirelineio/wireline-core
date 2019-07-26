//
// Copyright 2019 Wireline, Inc.
//

const ContactsView = require('./contacts');
const CRDTDocumentsView = require('./crdt-documents');
const ItemsView = require('./items');
const LogsView = require('./logs');
const ChatLogsView = require('./chat-logs');

module.exports.ViewTypes = {
  ContactsView,
  CRDTDocumentsView,
  ItemsView,
  LogsView,
  ChatLogsView
};

// TODO(burdon): Remove plurals.
module.exports.Views = [

  // System views.

  {
    name: 'contacts',
    view: 'ContactsView'
  },
  {
    name: 'items',
    view: 'ItemsView'
  },

  // Custom views.
  {
    name: 'crdt-documents',
    view: 'CRDTDocumentsView'
  },
  {
    name: 'presentations',
    view: 'CRDTDocumentsView'
  },

  // TODO(burdon): Move to Launchpad?
  // TODO(burdon): No need to register LogView since default?
  {
    name: 'graphs',
    view: 'LogsView'
  },
  {
    name: 'sketch',
    view: 'LogsView'
  },
  {
    name: 'kanban',
    view: 'LogsView'
  },

  // Custom views.

  {
    name: 'chess',
    view: 'LogsView'
  },
  {
    name: 'chat',
    view: 'ChatLogsView'
  }
];
