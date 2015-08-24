document.querySelector('#auth').onclick = function(){
    chrome.identity.launchWebAuthFlow({
        'url': 'https://github.com/login/oauth/authorize?client_id=3203b299f932726f9d64',
        'interactive': true
    },function (redirect_url) {
        var codeRegexp = /^https\:\/\/[a-z\.]*\/provider_cb\?code=([a-z0-9]*)/,
            code = codeRegexp.exec(redirect_url)[1];

        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open('POST', 'https://github.com/login/oauth/access_token', true);
        xmlhttp.setRequestHeader('Content-Type', 'application/json')

        xmlhttp.onreadystatechange = function () {
            var tokenRegexp = /access_token=([a-z0-9]*)/,
                token;

            if (xmlhttp.readyState == 4) {
                if (xmlhttp.status == 200) {
                    token = tokenRegexp.exec(xmlhttp.responseText)[1];
                    chrome.storage.sync.set({
                        token: token
                    });
                    document.querySelector('.token').value = token;
                }
            }
        };

        xmlhttp.send(JSON.stringify({
            "code": code,
            "client_id": "3203b299f932726f9d64",
            "client_secret": "a15a7d80d203f80ffc4c542418af6a20b39171d9"
        }));
    });
}

chrome.storage.sync.get(function(storage){
    var token = storage.token;

    if (token){
        document.querySelector('.token').value = token;
    }
});
