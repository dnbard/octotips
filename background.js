chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (sender.id !== chrome.runtime.id || request.action !== 'github-auth'){
            return;
        }

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

                if (xmlhttp.readyState === 4 && xmlhttp.status === 200 && tokenRegexp.test(xmlhttp.responseText)) {
                    token = tokenRegexp.exec(xmlhttp.responseText)[1];
                    chrome.storage.sync.set({
                        token: token
                    });
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "github-token",
                            token: btoa(token)
                        });
                    });
                }
            };

            xmlhttp.send(JSON.stringify({
                "code": code,
                "client_id": "3203b299f932726f9d64",
                "client_secret": "a15a7d80d203f80ffc4c542418af6a20b39171d9"
            }));
        });
    });
