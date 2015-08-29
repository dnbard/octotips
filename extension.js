console.log('Octotips initialized');

var extend = function ( defaults, options ) {
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
    REPOSITORY: 'tooltip.repository'
};

var Requests = {};
Requests[TooltipTypes.REPOSITORY] = [
    { path: 'https://api.github.com/repos%URL%', field: 'main' },
    { path: 'https://api.github.com/repos%URL%/contributors', field: 'contributors' },
    { path: 'https://api.github.com/repos%URL%/stats/contributors', field: 'stats' }
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
        linkRegex = /^(\/[a-z0-9\-\_\.]*\/[a-z0-9\-\_\.]*).*?(?!commits)/i,
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
            '/tree'
        ].join('|'));

    Array.prototype.slice.call(linkElements, 0).forEach(function (element) {
        var href = element.getAttribute('href'),
            ariaLabel = element.getAttribute('aria-label'),
            isAlreadyInitialized = !!element.getAttribute('data-octotips-id'),
            id;

        if (ariaLabel === 'Code' || isAlreadyInitialized){
            return;
        }

        if (linkRegex.test(href) && !stopRegex.test(href)) {
            id = uuid();

            collection.set(id, {
                type: TooltipTypes.REPOSITORY,
                target: linkRegex.exec(href)[1]
            });
            element.setAttribute('data-octotips-id', id);
        }
    });
}

initialize();

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
            requestsMade = 0;

        tooltip.querySelector('.octotip-loader__inner').style.width = (requestsMade + 1) / requests.length * 100 + '%';

        requests.forEach(function(request){
            makeHTTPRequest(request.path.replace('%URL%', url), tooltipAction, tooltip, {
                done: function(data){
                    requestsMade ++;
                    if (requestsMade === requests.length){
                        setTimeout(function(){
                            populateTooltip(tooltip, documents.get(tooltipAction.target));
                        }, 100);
                    }
                },
                save: function(data){
                    var result = {};
                    result[request.field] = data;
                    mapExtend(documents, tooltipAction.target, result);

                    tooltip.querySelector('.octotip-loader__inner').style.width = (requestsMade + 1) / requests.length * 100 + '%';
                }
            });
        });
    } else {
        populateTooltip(tooltip, documents.get(tooltipAction.target));
    }
}

function makeHTTPRequest(url, tooltipAction, tooltip, callback){
    var xmlhttp = new XMLHttpRequest();
        xmlhttp.open('GET', url, true);
        xmlhttp.setRequestHeader('Content-Type', 'application/json');
        if (token){
            xmlhttp.setRequestHeader('Authorization', 'Bearer ' + token);
        }

        xmlhttp.onreadystatechange = function () {
            var data;

            if (xmlhttp.status >= 400){
                return populateErrorTooltip(tooltip);
            }

            if (xmlhttp.responseText && xmlhttp.readyState == 4){
                try{
                    data = JSON.parse(xmlhttp.responseText);

                    var link = xmlhttp.getResponseHeader('Link');

                    if (link && /<([\S]*)>;\srel="next"/.test(link)){
                        callback.save.call(this, data);
                        makeHTTPRequest(/<([\S]*)>;\srel="next"/.exec(link)[1], tooltipAction, tooltip, callback);
                    } else {
                        callback.save.call(this, data);
                        callback.done.call(this, data);
                    }
                } catch(e){ }
            }
        };

        xmlhttp.send(null);
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

function populateTooltip(tooltipNode, data){
    function getDescendantProp(obj, desc) {
        var arr = desc.split(".");
        while(arr.length && (obj = obj[arr.shift()]));
        return obj;
    }

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
