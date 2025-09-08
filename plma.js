(function() {
    'use strict';

    // ⚠️ IMPORTANT: Replace with your actual Vercel deployment URL
    const PROXY_BASE = 'https://your-vercel-app-name.vercel.app/api/proxy/';
    
    let network = Lampa.Reguest;

    function vixsrcSource() {
        let source = {
            name: 'VixSrc',
            title: 'VixSrc'
        };

        source.search = function(object, callback) {
            searchContent(object, callback);
        };

        source.get = function(object, callback) {
            getStream(object, callback);
        };

        return source;
    }

    function searchContent(object, callback) {
        const searchQuery = object.search || object.title || object.name || object.original_title;
        const searchUrl = `https://vixsrc.to/search?q=${encodeURIComponent(searchQuery)}`;
        
        console.log('VixSrc searching for:', searchQuery);
        
        network.silent(searchUrl, (data) => {
            try {
                let items = [];
                let parser = new DOMParser();
                let doc = parser.parseFromString(data, 'text/html');
                
                doc.querySelectorAll('.film-poster-ahref').forEach((element, index) => {
                    let link = element.getAttribute('href');
                    let img = element.querySelector('img');
                    let title = img ? img.getAttribute('title') : '';
                    let poster = img ? img.getAttribute('data-src') : '';
                    
                    if (link && title) {
                        let match = link.match(/\/(movie|tv)\/(\d+)/);
                        if (match) {
                            // Calculate similarity score for better matching
                            let similarity = calculateSimilarity(searchQuery.toLowerCase(), title.toLowerCase());
                            
                            items.push({
                                id: match[2],
                                type: match[1],
                                title: title,
                                poster: poster && !poster.includes('placeholder') ? poster : '',
                                url: 'https://vixsrc.to' + link,
                                similarity: similarity,
                                year: extractYear(title) || object.year || object.first_air_date,
                                source: 'vixsrc'
                            });
                        }
                    }
                });
                
                // Sort by similarity score
                items.sort((a, b) => b.similarity - a.similarity);
                
                console.log('VixSrc found', items.length, 'results');
                callback({
                    results: items.slice(0, 10), // Return top 10 results
                    total: items.length
                });
                
            } catch (e) {
                console.error('VixSrc search error:', e);
                callback({ results: [], total: 0 });
            }
        }, (error) => {
            console.error('VixSrc network error:', error);
            callback({ results: [], total: 0 });
        });
    }

    function calculateSimilarity(str1, str2) {
        // Simple similarity calculation
        let longer = str1.length > str2.length ? str1 : str2;
        let shorter = str1.length > str2.length ? str2 : str1;
        let editDistance = getEditDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    function getEditDistance(str1, str2) {
        let matrix = [];
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[str2.length][str1.length];
    }

    function extractYear(title) {
        let match = title.match(/\((\d{4})\)/);
        return match ? match[1] : null;
    }

    function getStream(object, callback) {
        console.log('VixSrc getting stream for:', object);
        
        if (object.type === 'tv' && object.season && object.episode) {
            getEpisodeStream(object, callback);
        } else {
            getMovieStream(object, callback);
        }
    }

    async function getMovieStream(object, callback) {
        try {
            const playlist = await getPlaylist(object.id, 'movie');
            if (playlist) {
                callback([{
                    title: object.title,
                    quality: 'AUTO',
                    url: playlist,
                    timeline: Lampa.Timeline.view(object.id),
                    subtitles: []
                }]);
            } else {
                callback([]);
            }
        } catch (error) {
            console.error('Error getting movie stream:', error);
            callback([]);
        }
    }

    async function getEpisodeStream(object, callback) {
        try {
            const playlist = await getPlaylist(object.id, 'tv', object.season, object.episode);
            if (playlist) {
                callback([{
                    title: `${object.title} S${object.season}E${object.episode}`,
                    quality: 'AUTO', 
                    url: playlist,
                    timeline: Lampa.Timeline.view(`${object.id}_${object.season}_${object.episode}`),
                    subtitles: []
                }]);
            } else {
                callback([]);
            }
        } catch (error) {
            console.error('Error getting episode stream:', error);
            callback([]);
        }
    }

    async function getPlaylist(id, type, season = null, episode = null) {
        try {
            let url = type === 'tv' && season && episode 
                ? `https://vixsrc.to/tv/${id}/${season}/${episode}/`
                : `https://vixsrc.to/movie/${id}`;
            
            console.log('VixSrc fetching playlist from:', url);
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://vixsrc.to/'
                }
            });
            
            const text = await response.text();
            
            const playlistMatch = text.match(
                /token': '([^']+)',[\s\n]+expires': '([^']+)',[\s\S]*?url: '([^']+)',[\s\n]+}[\s\n]+window\.canPlayFHD = (false|true)/
            );
            
            if (!playlistMatch) {
                console.error('Could not extract playlist data from VixSrc');
                return null;
            }
            
            const [, token, expires, playlistUrl, canPlayFHD] = playlistMatch;
            const urlObj = new URL(playlistUrl);
            const b = urlObj.searchParams.get("b");
            
            urlObj.searchParams.append("token", token);
            urlObj.searchParams.append("expires", expires);
            if (b !== null) urlObj.searchParams.append("b", b);
            if (canPlayFHD === "true") urlObj.searchParams.append("h", "1");
            
            console.log('VixSrc playlist generated successfully');
            return urlObj.toString();
            
        } catch (error) {
            console.error('Error getting VixSrc playlist:', error);
            return null;
        }
    }

    function setupHlsProxy(hls) {
        if (!hls || !hls.config) return;
        
        console.log('Setting up VixSrc HLS proxy');
        
        hls.config.xhrSetup = function(xhr, url) {
            const proxyUrl = PROXY_BASE + encodeURIComponent(url);
            console.log('VixSrc proxying:', url);
            xhr.open('GET', proxyUrl, true);
        };

        // Also handle fetch requests if available
        if (hls.config.loader && typeof hls.config.loader === 'function') {
            const originalLoader = hls.config.loader;
            hls.config.loader = function(config) {
                if (config.url) {
                    config.url = PROXY_BASE + encodeURIComponent(config.url);
                }
                return originalLoader.call(this, config);
            };
        }
    }

    // Hook into Lampa's player initialization
    function hookPlayer() {
        let originalPlay = Lampa.Player.play;
        
        Lampa.Player.play = function(video) {
            let player = originalPlay.call(this, video);
            
            // Setup proxy when HLS is ready
            if (player && video.url && video.url.includes('vixsrc')) {
                let setupAttempts = 0;
                let checkHls = setInterval(() => {
                    setupAttempts++;
                    
                    try {
                        if (player.video && player.video() && player.video().hls) {
                            setupHlsProxy(player.video().hls);
                            clearInterval(checkHls);
                        } else if (setupAttempts > 50) {
                            clearInterval(checkHls);
                            console.warn('VixSrc: HLS not found after 5 seconds');
                        }
                    } catch (e) {
                        if (setupAttempts > 50) {
                            clearInterval(checkHls);
                        }
                    }
                }, 100);
            }
            
            return player;
        };
    }

    // Settings integration
    function addSettings() {
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: {
                name: 'vixsrc_enabled',
                type: 'trigger', 
                default: true
            },
            field: {
                name: 'VixSrc',
                description: 'Enable VixSrc streaming source'
            },
            onChange: (value) => {
                Lampa.Storage.set('vixsrc_enabled', value);
                if (value) {
                    addSource();
                } else {
                    removeSource();
                }
            }
        });
    }

    function addSource() {
        let enabled = Lampa.Storage.get('vixsrc_enabled', true);
        if (enabled) {
            Lampa.VideoSource.add('vixsrc', vixsrcSource());
            console.log('VixSrc source added');
        }
    }

    function removeSource() {
        Lampa.VideoSource.remove('vixsrc');
        console.log('VixSrc source removed');
    }

    // Initialize plugin
    function startPlugin() {
        if (window.vixsrc_plugin_ready) return;
        window.vixsrc_plugin_ready = true;
        
        console.log('Initializing VixSrc plugin with proxy:', PROXY_BASE);
        
        // Add the source to Lampa's video sources
        addSource();
        
        // Hook into player for HLS proxy setup
        hookPlayer();
        
        // Add settings
        addSettings();
        
        console.log('VixSrc plugin ready');
    }

    // Wait for Lampa to be ready
    if (window.Lampa) {
        startPlugin();
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            if (window.Lampa) {
                startPlugin();
            } else {
                setTimeout(startPlugin, 1000);
            }
        });
    }

})();
