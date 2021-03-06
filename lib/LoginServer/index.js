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

const async = require("async");
const net = require("net");
const util = require("../../src/nps_utils.js");
const logger = require("../../src/logger.js");
const packet = require("../../src/packet.js");

const LoginPacket = require("./LoginPacket.js");

const database = require("../database/index.js");

function getRequestCode(rawBuffer) {
  return `${util.toHex(rawBuffer[0])}${util.toHex(rawBuffer[1])}`;
}

function updateSessionKey(customerId, sessionKey, contextId, remoteAddress) {
  const sKey = sessionKey.substr(0, 16);

  database.db.serialize(function() {
    database.db.run(
      "INSERT OR REPLACE INTO sessions (customer_id, session_key, s_key, context_id, remote_address) VALUES ($1, $2, $3, $4, $5)",
      [customerId, sessionKey, sKey, contextId, remoteAddress],
      (err, results) => {
        if (err) {
          // Unknown error
          console.error(
            `DATABASE ERROR: Unable to store sessionKey: ${err.message}`
          );
          console.error("Error updating session key...");
          console.error(err.message);
          console.error(err.stack);
          process.exit(1);
        }
        logger.debug(
          `DATABASE: Updated ${customerId} session with session key ${sessionKey}`
        );
        return;
      }
    );
  });
}

function npsGetCustomerIdByContextId(contextId) {
  switch (contextId.toString()) {
    case "d316cd2dd6bf870893dfbaaf17f965884e":
      return {
        userId: Buffer.from([0x00, 0x00, 0x00, 0x02]),
        customerId: Buffer.from([0x00, 0x00, 0x00, 0x01]),
      };
    case "5213dee3a6bcdb133373b2d4f3b9962758":
      return {
        userId: Buffer.from([0x00, 0x00, 0x00, 0x02]),
        customerId: Buffer.from([0xac, 0x01, 0x00, 0x00]),
      };
    default:
      logger.error(`Unknown contextId: ${contextId.toString()}`);
      process.exit(1);
      return null;
  }
}

function userLogin(socket, data) {
  const loginPacket = LoginPacket(socket, data);

  logger.info(`=============================================
    Received login packet on port ${socket.localPort} from ${socket.remoteAddress}...`);
  logger.debug("NPS opCode: ", loginPacket.opCode);
  logger.debug("contextId:", loginPacket.contextId);
  logger.debug("Decrypted SessionKey: ", loginPacket.sessionKey);
  logger.info("=============================================");

  // Load the customer record by contextId
  // TODO: This needs to be from a database, right now is it static
  const customer = npsGetCustomerIdByContextId(loginPacket.contextId);

  // Save sessionKey in database under customerId
  updateSessionKey(
    customer.customerId.readInt32BE(),
    loginPacket.sessionKey.toString("hex"),
    loginPacket.contextId,
    socket.remoteAddress
  );

  // Create the packet content
  // TODO: This needs to be dynamically generated, right now we are using a
  // a static packet that works _most_ of the time
  const packetContent = packet.premadeLogin();

  // This is needed, not sure for what
  // TODO: Find out what these bytes mean
  Buffer.from([0x01, 0x01]).copy(packetContent);

  // load the customer id
  customer.customerId.copy(packetContent, 10);

  // Don't use queue?
  Buffer.from([0x00]).copy(packetContent, 207);
  // Don't use queue? (debug)
  Buffer.from([0x00]).copy(packetContent, 463);

  // Set response Code 0x0601 (debug)
  packetContent[255] = 0x06;
  packetContent[256] = 0x01;

  // For debug
  packetContent[257] = 0x01;
  packetContent[258] = 0x01;

  // load the customer id (debug)
  customer.customerId.copy(packetContent, 267);

  // Build the packet
  const packetResult = packet.buildPacket(556, 0x0601, packetContent);

  return packetResult;
}

function loginDataHandler(socket, rawData) {
  // TODO: Check if this can be handled by a MessageNode object
  const requestCode = getRequestCode(rawData);

  switch (requestCode) {
    // npsUserLogin
    case "0501": {
      const responsePacket = userLogin(socket, rawData);

      socket.write(responsePacket);
      break;
    }
    default:
      util.dumpRequest(socket, rawData, requestCode);
      logger.error(`Unknown code ${requestCode} was received on port 8226`);
  }
}

module.exports = { loginDataHandler };
