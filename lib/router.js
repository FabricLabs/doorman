'use strict';

/**
 * Maintains a list of triggers ("commands") and their behaviors.
 * @param       {Object} map Map of command names => behaviors.
 * @constructor
 */
function Router (map) {
  this.handlers = map || {};
}

/**
 * Assembles an array of responses to the triggers contained in a particular message.
 * @param  {String} msg Input message to route.
 * @return {Array}     List of outputs generated from the input string.
 */
Router.prototype.route = async function handle (msg) {
  if (typeof msg !== 'string') return;
  let parts = msg.split(/\s+/g);
  let output = [];

  for (var token in parts) {
    let command = token.toLowerCase();
    if (this.handlers[command]) {
      let result = await this.handlers[command].apply({}, msg);
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
