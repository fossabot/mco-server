// mco-server is a game server, written from scratch, for an old game
// Copyright (C) <2017-2018>  <Joseph W Becher>

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

const { loginDataHandler } = require("../lib/LoginServer/index.js");
const { personaDataHandler } = require("../lib/PersonaServer/index.js");
const { handler } = require("./TCPManager.js");

let connections = [];

class Connection {
  constructor(id, sock) {
    this.id = id;
    this.appID = 0;
    this.status = "INACTIVE";
    this.sock = sock;
    this.msgEvent = null;
    this.lastMsg = 0;
    this.useEncryption = 0;
    this.enc = null;
    this.isSetupComplete = 0;
  }
}

/**
 * Create new connection if when haven't seen this socket before, 
 * or update the socket on the connection object if we have.
 * @param {String} id 
 * @param {Socket} socket 
 */
function findOrNewConnection(id, socket) {
  const con = findConnection(id);
  if (con != null) {
    console.log(`I have seen connection id ${id} before`);
    con.sock = socket;
  } else {
    connections.push(new Connection(id, socket));
    console.log(`I have not seen connection id ${id} before, adding it.`);
  }
}

/**
 * Breaks a connection id into address and port
 * @param {String} id 
 * @returns {JSON}
 */
function parseConnectionId(id) {
  const parts = id.split("_");
  const address = parts[0];
  const port = parts[1];
  return { address, port };
}

/**
 * Check incoming data and route it to the correct handler based on port
 * @param {String} id 
 * @param {Buffer} data 
 */
function processData(id, data) {
  console.log(`Got data from ${id}`, data);
  const connection = parseConnectionId(id);
  const connectionHandlers = {
    "8226": function() {
      loginDataHandler(findConnection(id).sock, data);
    },
    "8228": function() {
      personaDataHandler(findConnection(id).sock, data);
    },
    "7003": function() {
      handler(findConnection(id), data);
    },
    "43300": function() {
      handler(findConnection(id), data);
    },
  };

  /**
   * TODO: Create a fallback handler
   */
  if (
    typeof connectionHandlers[connection.port] != "function" ||
    connectionHandlers[connection.port]()
  ) {
    console.error(
      `No known handler for port ${connection.port}, unable to handle the request from ${connection.address}, aborting.`
    );
    process.exit(1);
  }
}

/**
 * Dump all connections for debugging
 */
function dumpConnections() {
  return connections;
}

/**
 * Locate connection by id in the connections array
 * @param {String} connectionId 
 */
function findConnection(connectionId) {
  results = connections.find(function(connection) {
    return connection.id.toString() == connectionId.toString();
  });
  if (results == undefined) {
    return null;
  } else {
    return results;
  }
}

/**
 * Deletes the provided connection id from the connections array
 * FIXME: Doesn't actually seem to work
 * @param {String} connectionId 
 */
function deleteConnection(connectionId) {
  connections.filter(conn => {
    return conn.id != connectionId;
  });
}

module.exports = {
  findOrNewConnection,
  processData,
  dumpConnections,
  findConnection,
  deleteConnection,
};
