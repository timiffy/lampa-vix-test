(function() {
  'use strict';

  function startPlugin() {
    if (window.vixsrc_plugin) return;
    window.vixsrc_plugin = true;

    var component = {
      create: function() {
        var network = new Lampa.Reguest();
        var extract = {};
        var object = {};
        var select_title = '';
        var prefer_http = Lampa.Storage.field('online_preferred_http') === true;
        var prefer_mp4 = Lampa.Storage.field('online_preferred_mp4') === true;
        var prox = Lampa.Storage.field('online_proxy_bazon') === true;
        var embed = Lampa.Storage.field('online_bazon_embed') === true;

        var scroll = new Lampa.Scroll({
          mask: true,
          over: true,
          step: 250
        });

        var files = new Lampa.Files({
          scroll: scroll,
          type: 'file'
        });

        var filter = new Lampa.Filter(scroll);

        /**
         * Начать поиск
         * @param {Object} _object 
         * @param {String} kinopoisk_id
         */
        this.search = function(_object, kinopoisk_id) {
          object = _object;
          select_title = object.search || object.movie.title;
          
          this.activity.loader(true);
          
          this.find();
        };

        this.find = function() {
          var _this = this;
          
          // Construct VixSrc URL based on movie type
          var vixsrc_url;
          if (object.movie.number_of_seasons) {
            // For TV series, we'll start with season 1 episode 1
            vixsrc_url = 'https://vixsrc.to/series/' + object.movie.id + '/1/1';
          } else {
            // For movies
            vixsrc_url = 'https://vixsrc.to/movie/' + object.movie.id;
          }

          // Fetch the VixSrc page
          network.silent(vixsrc_url, function(str) {
            _this.parseVixSrcPage(str, vixsrc_url);
          }, function(a, c) {
            _this.empty(network.errorDecode(a, c));
          }, false, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
        };

        this.parseVixSrcPage = function(html, base_url) {
          var _this = this;
          
          try {
            // Extract JavaScript variables from the page
            var videoMatch = html.match(/window\.video\s*=\s*({[^}]+})/);
            var streamsMatch = html.match(/window\.streams\s*=\s*(\[[^\]]+\])/);
            var playlistMatch = html.match(/window\.masterPlaylist\s*=\s*({[^}]+})/);
            
            if (!videoMatch || !streamsMatch) {
              throw new Error('Could not find video data in page');
            }

            var video = JSON.parse(videoMatch[1]);
            var streams = JSON.parse(streamsMatch[1]);
            var masterPlaylist = playlistMatch ? JSON.parse(playlistMatch[1]) : null;

            // Build results
            var results = [];
            
            if (object.movie.number_of_seasons) {
              // For TV series, build season/episode structure
              _this.buildSeriesResults(video, streams, masterPlaylist, results);
            } else {
              // For movies, create direct stream links
              _this.buildMovieResults(video, streams, masterPlaylist, results);
            }

            _this.success({
              results: results,
              object: object
            });

          } catch (error) {
            console.error('VixSrc parsing error:', error);
            _this.empty('Ошибка парсинга данных VixSrc');
          }
        };

        this.buildMovieResults = function(video, streams, masterPlaylist, results) {
          var movie_obj = {
            title: object.movie.title,
            quality: '1080p',
            info: '',
            movies: []
          };

          streams.forEach(function(stream, index) {
            movie_obj.movies.push({
              title: stream.name || ('Сервер ' + (index + 1)),
              quality: stream.name || 'HD',
              info: '',
              stream: stream.url,
              url: stream.url
            });
          });

          // Add master playlist if available
          if (masterPlaylist && masterPlaylist.url) {
            movie_obj.movies.push({
              title: 'Master Playlist',
              quality: 'AUTO',
              info: '',
              stream: masterPlaylist.url,
              url: masterPlaylist.url
            });
          }

          results.push(movie_obj);
        };

        this.buildSeriesResults = function(video, streams, masterPlaylist, results) {
          // For series, we need to fetch each season/episode
          // This is a simplified version - you might want to expand this
          var season_obj = {
            title: 'Сезон 1',
            quality: '1080p',
            info: '',
            seasons: []
          };

          var episodes = [];
          
          // For now, create episode 1 with available streams
          var episode = {
            title: 'Эпизод 1',
            quality: '1080p',
            info: '',
            season: 1,
            episode: 1,
            movies: []
          };

          streams.forEach(function(stream, index) {
            episode.movies.push({
              title: stream.name || ('Сервер ' + (index + 1)),
              quality: stream.name || 'HD',
              info: '',
              stream: stream.url,
              url: stream.url
            });
          });

          if (masterPlaylist && masterPlaylist.url) {
            episode.movies.push({
              title: 'Master Playlist',
              quality: 'AUTO',
              info: '',
              stream: masterPlaylist.url,
              url: masterPlaylist.url
            });
          }

          episodes.push(episode);
          season_obj.seasons = episodes;
          results.push(season_obj);
        };

        this.success = function(data) {
          this.activity.loader(false);
          
          if (data.results.length) {
            this.builddom(data.results);
            this.activity.toggle();
          } else {
            this.empty('Нет результатов');
          }
        };

        this.buildDom = function(data) {
          var _this = this;
          
          data.forEach(function(element) {
            if (element.seasons) {
              // Handle TV series
              element.seasons.forEach(function(episode) {
                _this.appendEpisode(episode, element);
              });
            } else if (element.movies) {
              // Handle movies
              _this.appendMovie(element);
            }
          });
        };

        this.appendMovie = function(element) {
          var _this = this;
          
          element.movies.forEach(function(movie) {
            var quality = movie.quality || '';
            var info = movie.info || '';
            
            var file = new Lampa.File({
              title: movie.title,
              quality: quality,
              info: info,
              movies: [movie]
            });

            file.on('click', function() {
              _this.start(movie);
            });

            files.append(file.render());
            scroll.append(file.render());
          });
        };

        this.appendEpisode = function(episode, season) {
          var _this = this;
          
          episode.movies.forEach(function(movie) {
            var file = new Lampa.File({
              title: episode.title + ' - ' + movie.title,
              quality: movie.quality || '',
              info: movie.info || ''
            });

            file.on('click', function() {
              _this.start(movie);
            });

            files.append(file.render());
            scroll.append(file.render());
          });
        };

        this.start = function(movie) {
          if (movie.stream || movie.url) {
            var video_url = movie.stream || movie.url;
            
            // Start video player
            Lampa.Player.play({
              title: select_title + (movie.title ? ' - ' + movie.title : ''),
              url: video_url,
              quality: movie.quality,
              subtitles: movie.subtitles,
              callback: function() {
                // Handle player callbacks if needed
              }
            });

            // Save viewing history
            var file_id = Lampa.Utils.hash(video_url);
            var view_data = {
              id: file_id,
              url: video_url,
              title: movie.title,
              movie: object.movie,
              time: Date.now()
            };
            
            Lampa.Storage.set('online_watched_last', view_data, true);
          }
        };

        this.empty = function(msg) {
          var empty = new Lampa.Empty({
            title: msg || 'Пусто',
            descr: ''
          });
          
          files.clear();
          scroll.clear();
          files.append(empty.render());
          this.activity.loader(false);
          this.activity.toggle();
        };

        this.start = function() {
          Lampa.Controller.add('content', {
            toggle: function() {
              Lampa.Controller.collectionSet(scroll.render(), files.render());
              Lampa.Controller.collectionFocus(false, scroll.render());
            },
            up: function() {
              if (Navigator.canmove('up')) {
                Navigator.move('up');
              } else Lampa.Controller.toggle('head');
            },
            down: function() {
              Navigator.move('down');
            },
            right: function() {
              Navigator.move('right');
            },
            left: function() {
              if (Navigator.canmove('left')) Navigator.move('left');
              else Lampa.Controller.toggle('menu');
            },
            back: function() {
              Lampa.Activity.backward();
            }
          });
          
          Lampa.Controller.toggle('content');
        };

        this.pause = function() {};

        this.stop = function() {};

        this.render = function() {
          return files.render();
        };

        this.destroy = function() {
          network.clear();
          files.destroy();
          scroll.destroy();
          network = null;
        };
      }
    };

    var manifest = {
      type: 'video',
      version: '1.0.0',
      name: 'VixSrc',
      description: 'Плагин для просмотра онлайн сериалов и фильмов через VixSrc',
      component: 'vixsrc',
      onContextMenu: function(object) {
        return {
          name: 'Смотреть онлайн',
          description: ''
        };
      },
      onContextLaunch: function(object) {
        resetTemplates();
        Lampa.Component.add('vixsrc', component);

        var id = Lampa.Utils.hash(object.number_of_seasons ? object.original_name : object.original_title);
        var all = Lampa.Storage.get('clarification_search', '{}');

        Lampa.Activity.push({
          url: '',
          title: 'VixSrc Онлайн',
          component: 'vixsrc',
          search: all[id] ? all[id] : object.title,
          search_one: object.title,
          search_two: object.original_title,
          movie: object,
          page: 1,
          clarification: all[id] ? true : false
        });
      }
    };

    var button = "<div class=\"full-start__button selector view--online vixsrc--button\" data-subtitle=\"" + manifest.name + " v" + manifest.version + "\">\n        <svg xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" viewBox=\"0 0 24 24\" xml:space=\"preserve\">\n            <path d=\"M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM8 15c0 .55.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1H9c-.55 0-1 .45-1 1zm2-4c0 .55.45 1 1 1h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1zm-2-4c0 .55.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1H9c-.55 0-1 .45-1 1z\" fill=\"currentColor\"></path>\n        </svg>\n        <span>VixSrc</span>\n    </div>";

    Lampa.Component.add('vixsrc', component);

    function resetTemplates() {
      Lampa.Template.add('vixsrc', '<div class="online"></div>');
      Lampa.Template.add('vixsrc_style', '<style>.vixsrc--button{background:#1e88e5!important}</style>');
    }

    resetTemplates();

    function addButton(e) {
      if (e.render.find('.vixsrc--button').length) return;
      
      var btn = $(button);
      
      btn.on('hover:enter', function() {
        resetTemplates();
        Lampa.Component.add('vixsrc', component);

        var id = Lampa.Utils.hash(e.movie.number_of_seasons ? e.movie.original_name : e.movie.original_title);
        var all = Lampa.Storage.get('clarification_search', '{}');

        Lampa.Activity.push({
          url: '',
          title: 'VixSrc Онлайн',
          component: 'vixsrc',
          search: all[id] ? all[id] : e.movie.title,
          search_one: e.movie.title,
          search_two: e.movie.original_title,
          movie: e.movie,
          page: 1,
          clarification: all[id] ? true : false
        });
      });
      
      e.render.after(btn);
    }

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        addButton({
          render: e.object.activity.render().find('.view--torrent'),
          movie: e.data.movie
        });
      }
    });

    try {
      if (Lampa.Activity.active().component == 'full') {
        addButton({
          render: Lampa.Activity.active().activity.render().find('.view--torrent'),
          movie: Lampa.Activity.active().card
        });
      }
    } catch (e) {}

    if (Lampa.Manifest.app_digital >= 177) {
      Lampa.Storage.sync('online_choice_vixsrc', 'object_object');
      Lampa.Storage.sync('online_watched_last', 'object_object');
    }
  }

  if (!window.vixsrc_plugin) startPlugin();

})();
