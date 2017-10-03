module.exports = Doorman => {
  Doorman.Discord.on('disconnected', () => {
    console.log('Disconnected from Discord!');
  });
};
