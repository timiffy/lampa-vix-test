(function() {
    'use strict';


    const PROXY_BASE = 'https://frplma.vercel.app/api/proxy/';
    
    let network = Lampa.Reguest;
    let enabled = Lampa.Storage.get('vixsrc_plugin_enabled', true);

    function component(object) {
        let comp = new Lampa.InteractionMain(object);
        let filtred = [];
        let last;

        this.create = function() {
            let html = $('<div class="category-full"><div class="items-line"></div></div>');
            let body = html.find('.items-line');
            filtred = [];
            
            searchContent(object.movie, (items) => {
                if (items.length === 0) {
                    body.append('<div class="empty">No results found</div>');
                    return;
                }

                items.forEach(item => {
                    let card = Lampa.Template.get('card', {
                        title: item.title || item.name,
                        release_date: item.year || '',
                        poster: item.poster || item.img,
                        id: item.id
                    });

                    card.addClass('card--collection');
                    card.find('.card__img').attr('src', item.poster || item.img);
                    
                    card.on('hover:focus', () => {
                        last = card[0];
                        comp.last = last;
                        comp.controller.enable('content');
                    });

                    card.on('hover:enter', () => {
                        playContent(item, object.movie);
                    });

                    body.append(card);
                    filtred.push(item);
                });

                comp.start(filtred);
            });

            return html;
        };

        this.active = function() {
            comp.controller.enable('content');
            if (last) last.focus();
        };

        this.render = function() {
            return comp.render();
        };

        this.destroy = function() {
            comp.destroy();
        };
    }

    function searchContent(movie, callback) {
        const searchQuery = movie.title || movie.name || movie.original_title;
        const searchUrl = `https://vixsrc.to/search?q=${encodeURIComponent(searchQuery)}`;
        
        console.log('Searching VixSrc for:', searchQuery);
        
        network.silent(searchUrl, (data) => {
            try {
                let items = [];
                let parser = new DOMParser();
                let doc = parser.parseFromString(data, 'text/html');
                
                // Look for movie/TV show links
                doc.querySelectorAll('.film-poster-ahref').forEach(element => {
                    let link = element.getAttribute('href');
                    let img = element.querySelector('img');
                    let title = img ? img.getAttribute('title') : '';
                    let poster = img ? img.getAttribute('data-src') : '';
                    
                    if (link && title) {
                        let match = link.match(/\/(movie|tv)\/(\d+)/);
                        if (match) {
                            items.push({
                                id: match[2],
                                type: match[1],
                                title: title,
                                poster: poster && !poster.includes('placeholder') ? poster : '',
                                url: 'https://vixsrc.to' + link
                            });
                        }
                    }
                });
                
                console.log('Found', items.length, 'items');
                callback(items);
            } catch (e) {
                console.error('VixSrc search error:', e);
                callback([]);
            }
        }, (error) => {
            console.error('Network error:', error);
            callback([]);
        });
    }

    async function getPlaylist(id, type, season = null, episode = null) {
        try {
            let url = type === 'tv' && season && episode 
                ? `https://vixsrc.to/tv/${id}/${season}/${episode}/`
                : `https://vixsrc.to/movie/${id}`;
            
            console.log('Fetching playlist from:', url);
            
            const response = await fetch(url);
            const text = await response.text();
            
            // Extract playlist data from the page
            const playlistMatch = text.match(
                /token': '([^']+)',[\s\n]+expires': '([^']+)',[\s\S]*?url: '([^']+)',[\s\n]+}[\s\n]+window\.canPlayFHD = (false|true)/
            );
            
            if (!playlistMatch) {
                console.error('Could not extract playlist data');
                return null;
            }
            
            const [, token, expires, playlistUrl, canPlayFHD] = playlistMatch;
            const urlObj = new URL(playlistUrl);
            const b = urlObj.searchParams.get("b");
            
            urlObj.searchParams.append("token", token);
            urlObj.searchParams.append("expires", expires);
            if (b !== null) urlObj.searchParams.append("b", b);
            if (canPlayFHD === "true") urlObj.searchParams.append("h", "1");
            
            console.log('Playlist URL generated successfully');
            return urlObj.toString();
        } catch (error) {
            console.error('Error getting playlist:', error);
            return null;
        }
    }

    function setupHlsProxy(hls) {
        if (!hls || !hls.config) return;
        
        console.log('Setting up HLS proxy');
        
        hls.config.xhrSetup = function(xhr, url) {
            const proxyUrl = PROXY_BASE + encodeURIComponent(url);
            console.log('Proxying HLS request:', url, '->', proxyUrl);
            xhr.open('GET', proxyUrl, true);
        };
    }

    function playContent(item, movie) {
        if (item.type === 'tv') {
            showEpisodeSelector(item, movie);
        } else {
            playMovie(item, movie);
        }
    }

    function showEpisodeSelector(item, movie) {
        let html = '<div class="selector"><div class="selector-title">Select Season & Episode</div>';
        html += '<div class="selector-content">';
        
        // Simple season/episode grid (you might want to fetch real data)
        for (let s = 1; s <= 3; s++) {
            html += `<div class="season-group">`;
            html += `<div class="season-title">Season ${s}</div>`;
            html += `<div class="episodes">`;
            for (let e = 1; e <= 10; e++) {
                html += `<div class="episode-item" data-season="${s}" data-episode="${e}">E${e}</div>`;
            }
            html += `</div></div>`;
        }
        html += '</div></div>';
        
        let modal = $(html);
        
        modal.find('.episode-item').on('hover:enter click', function() {
            let season = $(this).data('season');
            let episode = $(this).data('episode');
            Lampa.Modal.close();
            playEpisode(item, movie, season, episode);
        });
        
        Lampa.Modal.open({
            title: 'Select Episode',
            html: modal,
            size: 'medium'
        });
    }

    async function playMovie(item, movie) {
        Lampa.Noty.show('Loading movie...');
        const playlist = await getPlaylist(item.id, 'movie');
        if (playlist) {
            startPlayback(playlist, movie, item);
        } else {
            Lampa.Noty.show('Failed to load movie');
        }
    }

    async function playEpisode(item, movie, season, episode) {
        Lampa.Noty.show(`Loading S${season}E${episode}...`);
        const playlist = await getPlaylist(item.id, 'tv', season, episode);
        if (playlist) {
            startPlayback(playlist, movie, item, season, episode);
        } else {
            Lampa.Noty.show('Failed to load episode');
        }
    }

    function startPlayback(playlist, movie, item, season = null, episode = null) {
        let title = season ? 
            `${movie.title || movie.name} S${season}E${episode}` : 
            movie.title || movie.name;
        
        let video = {
            title: title,
            url: playlist,
            quality: 'AUTO',
            timeline: Lampa.Timeline.view(movie.id + (season ? `_${season}_${episode}` : '')),
            subtitles: []
        };

        console.log('Starting playback:', title, playlist);

        let player = Lampa.Player.play(video);
        
        // Setup proxy for HLS requests
        if (player && player.video && player.video()) {
            let videoElement = player.video();
            
            // Wait for HLS to be ready
            let setupAttempts = 0;
            let checkHls = setInterval(() => {
                setupAttempts++;
                
                if (videoElement.hls) {
                    setupHlsProxy(videoElement.hls);
                    clearInterval(checkHls);
                } else if (setupAttempts > 50) { // 5 second timeout
                    clearInterval(checkHls);
                    console.warn('HLS not found after 5 seconds');
                }
            }, 100);
        }

        player.playlist([video]);
    }

    function startPlugin() {
        window.plugin_vixsrc_ready = true;
        
        Lampa.Component.add('vixsrc', component);
        
        // Add button to movie details page
        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite' && enabled) {
                let btn = $(`
                    <div class="full-start__button selector" data-subtitle="Stream from VixSrc">
                        <span class="full-start__button-icon">🎬</span>
                        <span class="full-start__button-text">VixSrc</span>
                    </div>
                `);
                
                btn.on('hover:enter', () => {
                    Lampa.Activity.push({
                        url: '',
                        title: 'VixSrc - ' + (e.data.movie.title || e.data.movie.name),
                        component: 'vixsrc',
                        movie: e.data.movie,
                        page: 1
                    });
                });

                $('.full-start__buttons').eq(0).append(btn);
            }
        });

        // Add settings
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: {
                name: 'vixsrc_plugin_enabled',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'VixSrc Plugin',
                description: 'Enable VixSrc streaming plugin'
            },
            onChange: (value) => {
                enabled = value;
                Lampa.Storage.set('vixsrc_plugin_enabled', value);
            }
        });

        console.log('VixSrc plugin initialized with proxy:', PROXY_BASE);
    }

    if (!window.plugin_vixsrc_ready) {
        startPlugin();
    }

})();
