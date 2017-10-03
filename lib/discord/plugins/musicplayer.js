const YoutubeDL = require('youtube-dl');
const request = require('request');

module.exports = Doorman => {
  const options = false;
  const GLOBAL_QUEUE = (options && options.global) || false;
  const MAX_QUEUE_SIZE = (options && options.maxQueueSize) || 20;
  const queues = {};

  function getQueue(server) {
    // Check if global queues are enabled.
    if (GLOBAL_QUEUE) {
      server = '_'; // Change to global queue.
    }

    // Return the queue.
    if (!queues[server]) {
      queues[server] = [];
    }

    return queues[server];
  }

  function executeQueue(msg, queue) {
    // If the queue is empty, finish.
    if (queue.length === 0) {
      msg.channel.send(createEmbed('Playback finished.'));

      // Leave the voice channel.
      const voiceConnection = Doorman.Discord.voiceConnections.get(msg.guild.id);
      if (voiceConnection !== null) {
        if (voiceConnection.player.dispatcher) {
          voiceConnection.player.dispatcher.end();
        }

        voiceConnection.channel.leave();
        return;
      }
    }

    new Promise((resolve, reject) => {
      // Join the voice channel if not already in one.
      const voiceConnection = Doorman.Discord.voiceConnections.get(msg.guild.id);

      if (voiceConnection == null) {
        // Check if the user is in a voice channel.
        const voiceChannel = getAuthorVoiceChannel(msg);

        if (voiceChannel != null) {
          voiceChannel.join().then(connection => {
            resolve(connection);
          }).catch(console.error);
        } else {
          // Otherwise, clear the queue and do nothing.
          queue.splice(0, queue.length);
          reject();
        }
      } else {
        resolve(voiceConnection);
      }
    }).then(connection => {
      // Get the first item in the queue.
      const video = queue[0];

      // Play the video.
      msg.channel.send(createEmbed(`Now Playing: ${video.title}`)).then(() => {
        const dispatcher = connection.playStream(request(video.url));

        dispatcher.on('debug', i => console.log(`debug: ${i}`));
        // Catch errors in the connection.
        dispatcher.on('error', err => {
          msg.channel.send(`fail: ${err}`);
          // Skip to the next song.
          queue.shift();
          executeQueue(msg, queue);
        });

        // Catch the end event.
        dispatcher.on('end', () => {
          // Wait a second.
          setTimeout(() => {
            // Remove the song from the queue.
            queue.shift();

            // Play the next song in the queue.
            executeQueue(msg, queue);
          }, 1000);
        });
      }).catch(console.error);
    }).catch(console.error);
  }

  function getAuthorVoiceChannel(msg) {
    const voiceChannelArray = msg.guild.channels.filter(v => v.type.toLowerCase() === 'voice').filter(v => v.members.has(msg.author.id)).array();

    if (voiceChannelArray.length === 0) {
      return null;
    }

    return voiceChannelArray[0];
  }

  function createEmbed(text) {
    return {
      embed: {
        color: Doorman.Config.discord.defaultEmbedColor,
        author: {
          name: 'Music Player',
          icon_url: 'https://emojipedia-us.s3.amazonaws.com/thumbs/120/twitter/103/multiple-musical-notes_1f3b6.png'
        },
        footer: {
          text: 'powered by youtube-dl'
        },
        description: text
      }
    };
  }

  return {
    commands: [
      'play',
      'skip',
      'queue',
      'dequeue',
      'pause',
      'resume',
      'stop',
      'volume'
    ],
    play: {
      usage: '<search terms|URL>',
      description: `Plays the given video in the user's voice channel. Supports YouTube and many others: <http://rg3.github.io/youtube-dl/supportedsites.html>`,
      process: (msg, suffix, isEdit) => {
        if (isEdit) {
          return;
        }

        const arr = msg.guild.channels.filter(v => v.type === 'voice').filter(v => v.members.has(msg.author.id));
        // Make sure the user is in a voice channel.
        if (arr.length === 0) {
          return msg.channel.send(createEmbed(`You're not in a voice channel.`));
        }

        // Make sure the suffix exists.
        if (!suffix) {
          return msg.channel.send(createEmbed('No video specified!'));
        }

        // Get the queue.
        const queue = getQueue(msg.guild.id);

        // Check if the queue has reached its maximum size.
        if (queue.length >= MAX_QUEUE_SIZE) {
          return msg.channel.send(createEmbed('Maximum queue size reached!'));
        }

        // Get the video information.
        msg.channel.send(createEmbed('Searching...')).then(response => {
          // If the suffix doesn't start with 'http', assume it's a search.
          if (!suffix.toLowerCase().startsWith('http')) {
            suffix = `gvsearch1:${suffix}`;
          }

          // Get the video info from youtube-dl.
          YoutubeDL.getInfo(suffix, ['-q', '--no-warnings', '--force-ipv4'], (err, info) => {
            // Verify the info.
            if (err || info.format_id === undefined || info.format_id.startsWith('0')) {
              return response.edit(createEmbed('Invalid video!'));
            }

            // Queue the video.
            response.edit(createEmbed(`Queued: ${info.title}`)).then(resp => {
              queue.push(info);

              // Play if only one element in the queue.
              if (queue.length === 1) {
                executeQueue(msg, queue);
                resp.delete(1000);
              }
            }).catch(() => { });
          });
        }).catch(() => { });
      }
    },
    skip: {
      description: 'skips to the next song in the playback queue',
      process: (msg, suffix) => {
        // Get the voice connection.
        const voiceConnection = Doorman.Discord.voiceConnections.get(msg.guild.id);
        if (voiceConnection === null) {
          return msg.channel.send(createEmbed('No music being played.'));
        }

        // Get the queue.
        const queue = getQueue(msg.guild.id);

        // Get the number to skip.
        let toSkip = 1; // Default 1.
        if (!isNaN(suffix) && parseInt(suffix, 10) > 0) {
          toSkip = parseInt(suffix, 10);
        }
        toSkip = Math.min(toSkip, queue.length);

        // Skip.
        queue.splice(0, toSkip - 1);

        // Resume and stop playing.
        if (voiceConnection.player.dispatcher) {
          voiceConnection.player.dispatcher.resume();
        }

        voiceConnection.player.dispatcher.end();

        msg.channel.send(createEmbed(`Skipped ${toSkip}!`));
      }
    },
    queue: {
      description: 'prints the current music queue for this server',
      process: msg => {
        // Get the queue.
        const queue = getQueue(msg.guild.id);

        // Get the queue text.
        const text = queue.map((video, index) => (`${(index + 1)}: ${video.title}`)).join('\n');

        // Get the status of the queue.
        let queueStatus = 'Stopped';
        const voiceConnection = Doorman.Discord.voiceConnections.get(msg.guild.id);
        if (voiceConnection !== null && voiceConnection !== undefined) {
          queueStatus = voiceConnection.paused ? 'Paused' : 'Playing';
        }

        // Send the queue and status.
        msg.channel.send(createEmbed(`Queue (${queueStatus}):\n${text}`));
      }
    },
    dequeue: {
      description: 'Dequeues the given song index from the song queue. Use the queue command to get the list of songs in the queue.',
      process: (msg, suffix) => {
        // Define a usage string to print out on errors
        const usageString = `The format is "${Doorman.Config.commandPrefix}dequeue <index>". Use ${Doorman.Config.commandPrefix}queue to find the indices of each song in the queue.`;

        // Get the queue.
        const queue = getQueue(msg.guild.id);

        // Make sure the suffix exists.
        if (!suffix) {
          return msg.channel.send(createEmbed(`You need to specify an index to remove from the queue. ${usageString}`));
        }

        // Get the arguments
        const split = suffix.split(/(\s+)/);

        // Make sure there's only 1 index
        if (split.length > 1) {
          return msg.channel.send(createEmbed(`There are too many arguments. ${usageString}`));
        }

        // Remove the index
        let index = parseInt(split[0], 10);
        let songRemoved = ''; // To be filled out below
        if (!isNaN(index)) {
          index--;

          if (index >= 0 && index < queue.length) {
            songRemoved = queue[index].title;

            if (index === 0) {
              // If it was the first one, skip it
              const voiceConnection = Doorman.Discord.voiceConnections.get(msg.guild.id);
              if (voiceConnection.player.dispatcher) {
                voiceConnection.player.dispatcher.resume();
              }

              voiceConnection.player.dispatcher.end();
            } else {
              // Otherwise, just remove it from the queue
              queue.splice(index, 1);
            }
          } else {
            return msg.channel.send(createEmbed(`The index is out of range. ${usageString}`));
          }
        } else {
          return msg.channel.send(createEmbed(`That index isn't a number. ${usageString}`));
        }

        // Send the queue and status.
        msg.channel.send(createEmbed(`Removed '${songRemoved}' (index ${split[0]}) from the queue.`));
      }
    },
    pause: {
      description: 'pauses music playback',
      process: msg => {
        // Get the voice connection.
        const voiceConnection = Doorman.Discord.voiceConnections.get(msg.guild.id);
        if (voiceConnection === null) {
          return msg.channel.send(createEmbed('No music being played.'));
        }

        // Pause.
        msg.channel.send(createEmbed('Playback paused.'));

        if (voiceConnection.player.dispatcher) {
          voiceConnection.player.dispatcher.pause();
        }
      }
    },
    resume: {
      description: 'resumes music playback',
      process: msg => {
        // Get the voice connection.
        const voiceConnection = Doorman.Discord.voiceConnections.get(msg.guild.id);
        if (voiceConnection === null) {
          return msg.channel.send(createEmbed('No music being played.'));
        }

        // Resume.
        msg.channel.send(createEmbed('Playback resumed.'));
        if (voiceConnection.player.dispatcher) {
          voiceConnection.player.dispatcher.resume();
        }
      }
    },
    stop: {
      description: 'stops playback and removes everything from queue',
      process: msg => {
        const voiceConnection = Doorman.Discord.voiceConnections.get(msg.guild.id);
        const queue = getQueue(msg.guild.id);
        // Clear Queue
        queue.splice(0, queue.length);
        // Resume and stop playing.
        if (voiceConnection.player.dispatcher) {
          voiceConnection.player.dispatcher.resume();
        }
        voiceConnection.player.dispatcher.end();
      }
    },
    volume: {
      usage: '<volume|volume%|volume dB>',
      description: 'set music playback volume as a fraction, a percent, or in dB',
      process: (msg, suffix) => {
        // Get the voice connection.
        const voiceConnection = Doorman.Discord.voiceConnections.get(msg.guild.id);

        if (voiceConnection === null) {
          return msg.channel.send(createEmbed('No music being played.'));
        }

        // Set the volume
        if (voiceConnection.player.dispatcher) {
          if (suffix === '') {
            const displayVolume = Math.pow(voiceConnection.player.dispatcher.volume, 0.6020600085251697) * 100.0;
            msg.channel.send(createEmbed(`volume: ${displayVolume}%`));
          } else if (suffix.toLowerCase().indexOf('db') === -1) {
            if (suffix.indexOf('%') === -1) {
              if (suffix > 1) {
                suffix /= 100.0;
              }

              voiceConnection.player.dispatcher.setVolumeLogarithmic(suffix);
            } else {
              const num = suffix.split('%')[0];
              voiceConnection.player.dispatcher.setVolumeLogarithmic(num / 100.0);
            }
          } else {
            const value = suffix.toLowerCase().split('db')[0];
            voiceConnection.player.dispatcher.setVolumeDecibels(value);
          }
        }
      }
    }
  };
};
