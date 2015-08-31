console.log('Octotips initialized');

function getDescendantProp(obj, desc) {
        var arr = desc.split(".");
        while(arr.length && (obj = obj[arr.shift()]));
        return obj;
    }

function extend( defaults, options ) {
    var extended = {};
    var prop;
    for (prop in defaults) {
        if (Object.prototype.hasOwnProperty.call(defaults, prop)) {
            extended[prop] = defaults[prop];
        }
    }
    for (prop in options) {
        if (Object.prototype.hasOwnProperty.call(options, prop)) {
            if (Array.isArray(extended[prop]) && Array.isArray(options[prop])){
                extended[prop] = extended[prop].concat(options[prop]);
            } else {
                extended[prop] = options[prop];
            }
        }
    }
    return extended;
};

var collection = new Map(),
    documents = new Map(),
    isTooltipActive = false,
    token;

var TooltipTypes = {
    REPOSITORY: 'tooltip.repository',
    AUTHOR: 'tooltip.author'
};

var Requests = {};
Requests[TooltipTypes.REPOSITORY] = [
    { path: 'https://api.github.com/repos%URL%', field: 'main' },
    { path: 'https://api.github.com/repos%URL%/contributors', field: 'contributors' },
    { path: 'https://api.github.com/repos%URL%/stats/contributors', field: 'stats' }
];
Requests[TooltipTypes.AUTHOR] = [
    { path: 'https://api.github.com/users%URL%', field: 'user' },
    { path: 'https://api.github.com/users%URL%/repos', field: 'repos' }
];

function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0,
            v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

chrome.storage.sync.get(function(storage){
    token = storage.token;
});

function initialize(){
    var linkElements = document.querySelectorAll('a'),
        linkRegex = /^[htpsgihubcom\.\:\/]*(\/[a-z0-9\-\_\.]+\/[a-z0-9\-\_\.]+)/i,
        authorRegex = /^[htpsgihubcom\.\/:]*(\/[a-z0-9\-\_\.]*)$/i,
        stopRegex = new RegExp([
            '/profile',
            '/dashboard',
            '/account',
            '/organizations',
            '/settings',
            '/orgs',
            '/blog',
            '/commits',
            '/branches',
            '/releases',
            '/contributors',
            '/subscriptions',
            '/stargazers',
            '/network',
            '/issues',
            '/pulls',
            '/wiki',
            '/pulse',
            '/graphs',
            '/settings',
            '/archive',
            '/commit',
            '/blob',
            '/tree',
            '/notifications',
            '\\\?language',
            '/new',
            '/explore',
            '/stars',
            'help.github.com'
        ].join('|'));

    Array.prototype.slice.call(linkElements, 0).forEach(function (element) {
        var href = element.getAttribute('href'),
            ariaLabel = element.getAttribute('aria-label'),
            isAlreadyInitialized = !!element.getAttribute('data-octotips-id'),
            id;

        if (ariaLabel === 'Code' || isAlreadyInitialized || stopRegex.test(href)){
            return;
        }

        if (linkRegex.test(href)) {
            id = uuid();

            collection.set(id, {
                type: TooltipTypes.REPOSITORY,
                target: linkRegex.exec(href)[1],
                render: populateRepositoryTooltip
            });
            element.setAttribute('data-octotips-id', id);
        } else if (authorRegex.test(href)){
            id = uuid();

            collection.set(id, {
                type: TooltipTypes.AUTHOR,
                target: authorRegex.exec(href)[1],
                render: populateAuthorTooltip
            });
            element.setAttribute('data-octotips-id', id);
        }
    });
}

initialize();

function drawProgressBar(element, value){
    var currentValue = parseInt(element.style.width.replace('%', ''));

    if (currentValue > value){
        return;
    }

    element.style.width = value + '%';
}

document.body.onmouseout = function(e){
    var id = e.target.getAttribute('data-octotips-id'),
        tooltipNode = e.target.querySelector('.octotip');

    if (id === undefined || !tooltipNode) {
        return;
    }

    e.target.removeChild(tooltipNode);
    setTimeout(function(){
        isTooltipActive = false;
    }, 10);
}

document.body.onmouseover = function (e) {
    var id = e.target.getAttribute('data-octotips-id'),
        tooltipAction, url;

    if (id === undefined) {
        return;
    }

    tooltipAction = collection.get(id);

    if (!tooltipAction){
        return;
    }

    url = tooltipAction.target;

    var tooltip = document.createElement('div');
    tooltip.className = 'octotip';
    tooltip.innerHTML = '<div class="octotip-loader"><div class="octotip-loader__inner"></div></div>';

    isTooltipActive = true;
    e.target.appendChild(tooltip);

    if (!documents.has(tooltipAction.target)) {
        var requests = Requests[tooltipAction.type],
            requestsMade = 0,
            subRequestsMade = 0,
            maxRequests = requests.length;

        requests.forEach(function(request){
            var options = {
                url: request.path.replace('%URL%', url),
                tooltipAction: tooltipAction,
                tooltip: tooltip,
                firstRequest: true
            };

            makeHTTPRequest(options, {
                done: function(data){
                    requestsMade ++;
                    if (requestsMade === requests.length){
                        setTimeout(function(){
                            populateTooltip(tooltip, documents.get(tooltipAction.target), tooltipAction);
                        }, 100);
                    }
                },
                save: function(data){
                    var result = {};
                    result[request.field] = data;
                    mapExtend(documents, tooltipAction.target, result);

                    subRequestsMade ++;

                    drawProgressBar(tooltip.querySelector('.octotip-loader__inner'), subRequestsMade / maxRequests * 100);
                }
            });
        });
    } else {
        populateTooltip(tooltip, documents.get(tooltipAction.target), tooltipAction);
    }

    function makeHTTPRequest(options, callback){
        var xmlhttp = new XMLHttpRequest();
            xmlhttp.open('GET', options.url, true);
            xmlhttp.setRequestHeader('Content-Type', 'application/json');
            if (token){
                xmlhttp.setRequestHeader('Authorization', 'Bearer ' + token);
            }

            xmlhttp.onreadystatechange = function () {
                var data;

                if (xmlhttp.status >= 400){
                    return populateErrorTooltip(options.tooltip);
                }

                if (xmlhttp.responseText && xmlhttp.readyState == 4){
                    try{
                        data = JSON.parse(xmlhttp.responseText);

                        var link = xmlhttp.getResponseHeader('Link');

                        if (link && /<([\S]*)>;\srel="next"/.test(link)){
                            if (options.firstRequest && /page=([0-9]*)>;\srel="last"/.test(link)){
                                var additionalRequests = parseInt(/page=([0-9]*)>;\srel="last"/.exec(link)[1]) - 1;
                                maxRequests += additionalRequests;
                            }

                            options.url = /<([\S]*)>;\srel="next"/.exec(link)[1];
                            options.firstRequest = false;

                            callback.save.call(this, data);
                            makeHTTPRequest(options, callback);
                        } else {
                            callback.save.call(this, data);
                            callback.done.call(this, data);
                        }
                    } catch(e){
                        debugger;
                    }
                }
            };

            xmlhttp.send(null);
    }
}

function mapExtend(map, id, obj){
    var oldObj = map.get(id) || {};
    var newObj = extend(oldObj, obj);
    map.set(id, newObj);
    return newObj;
}

function populateErrorTooltip(tooltipNode){
    tooltipNode.innerHTML =
        '<div>Error</div>' +
        '<div>Please login to the GitHub as Octotips user</div>' +
        '<div>More help can be found at: https://github.com/dnbard/octotips</div>';
}

function populateAuthorTooltip(tooltipNode, data, tooltipAction){
    var templateRegex = /\%([a-z\.\_]*)\%/gi,
        evalTemplateRegex = /\$([a-z0-9\.\?\s\"\-\:\(\)\_\{\}\,\+\-\*\/\=]*)\$/gi,
        tooltipTemplate = [
            '<div class="author-avatar"><img src="%user.avatar_url%&s=64" width="64" height="64" /></div>',
            '<div class="author-body">',
                '<div class="author-name">',
                    '<span style="display: $user.name ? "inline-block" : "none"$;" class="octotip-highlight">%user.name%</span>',
                    '<span> [%user.login%]</span>',
                '</div>',
                '<div style="display: $user.location ? "block" : "none"$;" class="author-location"><span class="octotip-highlight">%user.location%</span></div>',
                '<div style="display: $user.company ? "block" : "none"$;" class="author-company">Company: <span class="octotip-highlight">%user.company%</span></div>',
                '<div>Folowers: <span class="octotip-highlight">%user.followers%</span></div>',
                '<div>Registered <time datetime="%user.created_at%" is="relative-time"></time></div>',
                '<div>Repositories: <span class="octotip-highlight">$repos.length$</span></div>',
                '<div>Stars: <span class="octotip-highlight">$repos.length === 0 ? 0 : repos.map(function(r){return r.stargazers_count}).reduce(function(a,b){return a+ b})$</span></div></div>',
            '</div>'
        ].join(''),
        match = templateRegex.exec(tooltipTemplate),
        keys = [];

    var user = data.user;
    var repos = data.repos;

    while (match != null) {
        keys.push(match[1]);
        match = templateRegex.exec(tooltipTemplate);
    }

    keys.forEach(function(key){
        var value = getDescendantProp(data, key);
        tooltipTemplate = tooltipTemplate.replace('%' + key + '%', value);
    });

    keys = [];
    match = evalTemplateRegex.exec(tooltipTemplate)
    while (match != null) {
        keys.push(match[1]);
        match = evalTemplateRegex.exec(tooltipTemplate);
    }

    keys.forEach(function(key){
        tooltipTemplate = tooltipTemplate.replace('$' + key + '$', eval(key));
    });

    tooltipNode.innerHTML = tooltipTemplate;
}

function populateRepositoryTooltip(tooltipNode, data, tooltipAction){
    var templateRegex = /\%([a-z\.\_]*)\%/gi,
        tooltipTemplate = [
            '<div class="octotip-title">',
                '<span class="octotip-name">%main.name%</span>',
                ' by ',
                '<span class="octotip-author">',
                    '<img class="octotip-avatar" src="%main.owner.avatar_url%&s=16" />',
                    '%main.owner.login%',
                '</span>',
            '</div>',
            '<div class="octotip-fork" style="display: none;">' +
                '<span class="octicon octicon-repo-forked"></span>',
                '<span>forked from <span class="octotip-highlight">%main.parent.full_name%</span></span>',
            '</div>',
            '<div class="octotip-counters">',
                '<span>%main.subscribers_count%<span class="octicon octicon-eye"></span></span>',
                '<span>%main.stargazers_count%<span class="octicon octicon-star"></span></span>',
                '<span>%main.forks_count%<span class="octicon octicon-repo-forked"></span></span>',
            '</div>',
            '<div class="octotip-description"></div>',
            '<hr />',
            '<div class="octotip-contributors">Contributors: <span class="octotip-highlight">0</span></div>',
            '<div class="octotip-language">Language: <span class="octotip-highlight">%main.language%</span></div>',
            '<div class="octotip-size">Repository Size: <span class="octotip-highlight"></span></div>',
            '<div>Open Issues: <span class="octotip-highlight">%main.open_issues_count%</span></div>',
            '<div>Updated <time datetime="%main.pushed_at%" is="relative-time"></time></div>'
        ].join(''),
        match = templateRegex.exec(tooltipTemplate),
        keys = [];

    while (match != null) {
        keys.push(match[1]);
        match = templateRegex.exec(tooltipTemplate);
    }

    keys.forEach(function(key){
        var value = getDescendantProp(data, key);
        tooltipTemplate = tooltipTemplate.replace('%' + key + '%', value);
    });

    tooltipNode.innerHTML = tooltipTemplate;

    if (data.main.fork){
        tooltipNode.querySelector('.octotip-fork').style.display = "block";
    }

    if (data.main.language === null){
        tooltipNode.querySelector('.octotip-language').style.display = "none";
    }

    if (data.main.size){
        if (data.main.size > 999){
            tooltipNode.querySelector('.octotip-size .octotip-highlight').innerText = (data.main.size / 1000).toFixed(1) + ' MB';
        } else {
            tooltipNode.querySelector('.octotip-size .octotip-highlight').innerText = data.main.size + ' KB';
        }
    } else {
        tooltipNode.querySelector('.octotip-size').style.display = 'none';
    }

    if (data.main.description){
        tooltipNode.querySelector('.octotip-description').innerText = data.main.description;
    }

    if (data.contributors){
        tooltipNode.querySelector('.octotip-contributors .octotip-highlight').innerText = data.contributors.length;
    }
}

function populateTooltip(tooltipNode, data, tooltipAction){
    if (typeof tooltipAction.render === 'function'){
        tooltipAction.render.apply(this, arguments);
    } else {
        tooltipNode.style.display = 'none';
    }
}

var callback = function(allmutations){
    if (isTooltipActive){
        return;
    }

    initialize();
},
    mo = new MutationObserver(callback),
    options = {
        'childList': true,
        'subtree': true
    };
mo.observe(document.body, options);
