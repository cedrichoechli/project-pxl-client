const PubNubService = require('./pubsub');

module.exports = class PubSubService {
  constructor(config) {
    switch (config.pubsubType) {
      case 'pubnub':
        return new PubNubService(config.pubnub);
      default:
        return null;
    }
  }
};
