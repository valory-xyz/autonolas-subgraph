import { Bytes } from "@graphprotocol/graph-ts";
import { Global, Sender } from "../generated/schema";

export function getGlobal(): Global {
  let global = Global.load('');
  if (global == null) {
    global = new Global('');
    global.totalMechs = 0;
    global.totalMarketplaceRequests = 0;
    global.totalMarketplaceDeliveries = 0;
    global.totalMarketplaceDeliveriesWithSignatures = 0
    global.totalRequests = 0;
    global.totalDeliveries = 0;
    global.totalTransactions = 0;
  }
  return global;
}

export function createOrGetSender(address: Bytes): Sender {
  let sender = Sender.load(address);
  if (sender == null) {
    sender = new Sender(address);
    sender.id = address;
    sender.totalTransactions = 0;
    sender.totalMarketplaceRequests = 0;
    sender.totalRequests = 0;
    sender.totalOffChainRequests = 0;
  }
  return sender;
}