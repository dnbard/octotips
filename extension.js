console.log('Octotips initialized');

var token;

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

var linkElements = document.querySelectorAll('a'),
    linkRegex = /^(\/[a-z0-9\-\_\.]*\/[a-z0-9\-\_\.]*).*?(?!commits)/i,
    stopRexex = /(profile|dashboard|account|organizations|settings|orgs|blog|commits|branches|releases|contributors|subscriptions|stargazers|network|issues|pulls|wiki|pulse|graphs|settings|archive|commit|blob|tree)/i,
    collection = new Map(),
    documents = new Map();

Array.prototype.slice.call(linkElements, 0).forEach(function (element) {
    var href = element.getAttribute('href'),
        ariaLabel = element.getAttribute('aria-label'),
        id;

    if (ariaLabel === 'Code'){
        return;
    }

    if (linkRegex.test(href) && !stopRexex.test(href)) {
        id = uuid();

        collection.set(id, linkRegex.exec(href)[1]);
        element.setAttribute('data-octotips-id', id);
    }
});

document.body.onmouseout = function(e){
    var id = e.target.getAttribute('data-octotips-id'),
        tooltipNode = e.target.querySelector('.octotip');

    if (id === undefined || !tooltipNode) {
        return;
    }

    e.target.removeChild(tooltipNode);
}

document.body.onmouseover = function (e) {
    var id = e.target.getAttribute('data-octotips-id'),
        url;

    if (id === undefined) {
        return;
    }

    url = collection.get(id);

    if (!url){
        return;
    }

    var tooltip = document.createElement('div');
    tooltip.className = 'octotip';
    tooltip.innerHTML = '<div class="octotip-loader"></div>';

    e.target.appendChild(tooltip);

    if (!documents.has(url)) {
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open('GET', 'https://api.github.com/repos' + url, true);
        xmlhttp.setRequestHeader('Content-Type', 'application/json');
        if (token){
            xmlhttp.setRequestHeader('Authorization', 'Bearer ' + token);
        }

        xmlhttp.onreadystatechange = function () {
            var data;

            if (xmlhttp.status >= 400){
                return populateErrorTooltip(tooltip);
            }

            if (xmlhttp.responseText){
                try{
                    data = JSON.parse(xmlhttp.responseText);
                    documents.set(url, data);
                    populateTooltip(tooltip, data);
                } catch(e){ }
            }
        };

        xmlhttp.send(null);
    } else {
        populateTooltip(tooltip, documents.get(url));
    }
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
                '<span class="octotip-name">%name%</span>',
                ' by ',
                '<span class="octotip-author">',
                    '<img class="octotip-avatar" src="%owner.avatar_url%&s=16" />',
                    '%owner.login%',
                '</span>',
            '</div>',
            '<div class="octotip-fork" style="display: none;">' +
                '<span class="octicon octicon-repo-forked"></span>',
                '<span>forked from <span class="octotip-highlight">%parent.full_name%</span></span>',
            '</div>',
            '<div class="octotip-counters">',
                '<span>%subscribers_count%<span class="octicon octicon-eye"></span></span>',
                '<span>%stargazers_count%<span class="octicon octicon-star"></span></span>',
                '<span>%forks_count%<span class="octicon octicon-repo-forked"></span></span>',
            '</div>',
            '<div class="octotip-description"></div>',
            '<hr />',
            '<div class="octotip-language">Language: <span class="octotip-highlight">%language%</span></div>',
            '<div class="octotip-size">Repository Size: <span class="octotip-highlight"></span></div>',
            '<div>Open Issues: <span class="octotip-highlight">%open_issues_count%</span></div>',
            '<div>Updated <time datetime="%pushed_at%" is="relative-time"></time></div>'
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

    if (data.fork){
        tooltipNode.querySelector('.octotip-fork').style.display = "block";
    }

    if (data.language === null){
        tooltipNode.querySelector('.octotip-language').style.display = "none";
    }

    if (data.size){
        if (data.size > 999){
            tooltipNode.querySelector('.octotip-size .octotip-highlight').innerText = (data.size / 1000).toFixed(1) + ' MB';
        } else {
            tooltipNode.querySelector('.octotip-size .octotip-highlight').innerText = data.size + ' KB';
        }
    } else {
        tooltipNode.querySelector('.octotip-size').style.display = 'none';
    }

    if (data.description){
        tooltipNode.querySelector('.octotip-description').innerText = data.description;
    }
}
