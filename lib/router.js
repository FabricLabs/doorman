'use strict';

/**
 * Maintains a list of triggers ("commands") and their behaviors.
 * @param       {Object} map Map of command names => behaviors.
 * @constructor
 */
function Router (config) {
  this.config = config || {};
  this.handlers = {};
}

/**
 * Assembles an array of responses to the triggers contained in a particular message.
 * @param  {String} msg Input message to route.
 * @return {Array}     List of outputs generated from the input string.
 */
Router.prototype.route = async function handle (msg) {
  if (typeof msg !== 'string') return;
  let parts = msg
    .split(/\s+/g)
    .filter(x => x.charAt(0) === this.config.trigger)
    .map(x => x.substr(1));
  let output = [];

  for (var i in parts) {
    let token = parts[i];
    let command = token.toLowerCase();
    let handler = this.handlers[command];
    let result = null;

    if (handler) {
      switch (typeof handler.value) {
        case 'string':
          result = handler.value;
          break;
        default:
          result = await handler.value.apply({}, msg);
          break;
      }

      if (result) {
        output.push(result);
      }
    }
  }

  return output;
};

/**
 * Attaches a new handler to the router.
 * @param  {Plugin} plugin Instance of the plugin.
 * @param  {Plugin.name} name Name of the plugin.
 * @return {Router}        Configured instance of the router.
 */
Router.prototype.use = function configure (plugin) {
  this.handlers[plugin.name] = plugin;
  return this;
};

module.exports = Router;
