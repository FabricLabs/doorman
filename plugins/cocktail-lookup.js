const Doorman = require('../../doorman');

exports.commands = [
  'cocktail'
]

exports.cocktail = {
  usage: '[cocktail]',
  type: 'normal',
  description: 'Used to retrieve information about a cocktail.',
  process: (msg, suffix, isEdit, cb) => {
    if (!suffix) {
      cb({embed: {
        color: Doorman.Config.discord.defaultEmbedColor,
        author: {
          name: 'CocktailDB',
          url: 'http://www.thecocktaildb.com/',
          icon_url: 'https://emojipedia-us.s3.amazonaws.com/thumbs/240/twitter/103/cocktail-glass_1f378.png'
        },
        description: 'How about asking for something in specific?'
      }}, msg);
      return;
    };

    require('request')(`http://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(suffix)}`, function (err, res, body) {
      var response = JSON.parse(body);
      if (typeof response !== 'undefined' && response.drinks !== null) {
        let result = response.drinks[0];
        let ingredients = Object.entries(result).slice(7, 22).map(entry => entry[1]);
        let ratios = Object.entries(result).slice(22, 37).map(entry => entry[1]);

        if (typeof result.strInstructions !== 'undefined' && result.strInstructions !== '' && result.strInstructions !== null) {
          let fields = [];
          let thumbnail = '';
          if (typeof result.strDrinkThumb !== 'undefined' && result.strDrinkThumb !== '' && result.strDrinkThumb !== null) {
            thumbnail = result.strDrinkThumb;
          } else if (thumbnail === '') {
            thumbnail = 'https://emojipedia-us.s3.amazonaws.com/thumbs/240/twitter/103/tropical-drink_1f379.png';
          }
          if (typeof result.strGlass !== 'undefined' && result.strGlass !== '' && result.strGlass !== null) {
            fields.push({
              name: 'Glass:',
              value: result.strGlass,
              inline: true
            });
          };
          if (typeof ingredients !== 'undefined' && ingredients.length) {
            let ingredientsList = '';
            ingredients.forEach((element, index) => {
              if (element !== '' && element !== '\n' && element !== null) {
                if (ratios[index] !== '' && ratios[index] !== '\n' && ratios[index] !== null) {
                  ingredientsList += `* ${element} - ${ratios[index]}\n`;
                } else {
                  ingredientsList += `* ${element}\n`;
                }
              };
            });
            fields.push({
              name: 'Ingredients:',
              value: ingredientsList,
              inline: true
            });
          };
          fields.push({
            name: 'Instructions:',
            value: result.strInstructions
          });

          cb({embed: {
            color: Doorman.Config.discord.defaultEmbedColor,
            title: `__${result.strDrink}__`,
            author: {
              name: 'CocktailDB',
              url: 'http://www.thecocktaildb.com/',
              icon_url: 'https://emojipedia-us.s3.amazonaws.com/thumbs/240/twitter/103/cocktail-glass_1f378.png'
            },
            thumbnail: {
              url: thumbnail
            },
            fields: fields
          }}, msg);
        } else {
          cb({embed: {
            color: Doorman.Config.discord.defaultEmbedColor,
            author: {
              name: 'CocktailDB',
              url: 'http://www.thecocktaildb.com/',
              icon_url: 'https://emojipedia-us.s3.amazonaws.com/thumbs/240/twitter/103/cocktail-glass_1f378.png'
            },
            description: `${response.data.drinks[0].strDrink} is a good drink, but I don't have a good way to describe it.`
          }}, msg);
        }
      } else {
        cb({embed: {
          color: Doorman.Config.discord.defaultEmbedColor,
          author: {
            name: 'CocktailDB',
            url: 'http://www.thecocktaildb.com/',
            icon_url: 'https://emojipedia-us.s3.amazonaws.com/thumbs/240/twitter/103/cocktail-glass_1f378.png'
          },
          description: `Damn, I've never heard of that. Where do I need to go to find it?`
        }}, msg);
      }
    });
  }
}
