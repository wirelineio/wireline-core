//
// Copyright 2019 Wireline, Inc.
//

const AuthView = require('./auth');
const ContactsView = require('./contacts');
const DocumentsView = require('./documents');
const ItemsView = require('./items');
const LogsView = require('./logs');
const ChatLogsView = require('./chat-logs');

module.exports.ViewTypes = {
  AuthView,
  ContactsView,
  DocumentsView,
  ItemsView,
  LogsView,
  ChatLogsView
};

// TODO(burdon): Remove plurals.
module.exports.Views = [

  // System views.
  {
    name: 'auth',
    view: 'AuthView'
  },
  {
    name: 'contacts',
    view: 'ContactsView'
  },
  {
    name: 'items',
    view: 'ItemsView'
  }
];
