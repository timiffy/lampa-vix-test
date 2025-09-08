(function(){
    'use strict';

    // === Manifest ===
    Lampa.Plugin.create({
        title: 'VixSrc',
        id: 'vixsrc',
        description: 'Watch movies and TV shows via vixsrc.to',
        version: '1.0.0',
        author: 'You'
    });

    let network = new Lampa.Reguest();

    // Extracts either window.streams or window.masterPlaylist from HTML
    function extractStreams(html){
        // Try window.streams first
        let match = html.match(/window\.streams\s*=\s*(\[.*?\]);/s);
        if(match){
            try {
                return JSON.parse(match[1]);
            } catch(e){
                console.log('VixSrc parse error (streams)', e);
            }
        }

        // Fallback: window.masterPlaylist
        let match2 = html.match(/window\.masterPlaylist\s*=\s*({.*?});/s);
        if(match2){
            try {
                let obj = JSON.parse(match2[1]);
                return [{
                    name: 'Master',
                    url: obj.url + `?token=${obj.params.token}&expires=${obj.params.expires}`
                }];
            } catch(e){
                console.log('VixSrc parse error (master)', e);
            }
        }

        return [];
    }

    // Fetch and parse page
    function resolvePage(url, callback){
        network.silent(url, (html)=>{
            let streams = extractStreams(html);

            if(streams.length){
                let results = streams.map(s => ({
                    title: `VixSrc - ${s.name}`,
                    url: s.url,
                    quality: 'HD',
                    provider: 'VixSrc'
                }));
                callback(results);
            } else {
                callback([]);
            }
        }, (error)=>{
            console.log('VixSrc error', error);
            callback([]);
        }, false, {
            headers: {
                'User-Agent': navigator.userAgent,
                'Referer': 'https://vixsrc.to/'
            }
        });
    }

    // Worker entry point
    function worker(movie, season, episode, oncomplite){
        if(movie.type === 'movie'){
            let url = `https://vixsrc.to/movie/${movie.id}`;
            resolvePage(url, oncomplite);
        } else {
            let url = `https://vixsrc.to/tv/${movie.id}/${season}/${episode}`;
            resolvePage(url, oncomplite);
        }
    }

    // Register with Lampa
    Lampa.Platform.add({
        name: 'VixSrc',
        worker: worker
    });

})();
