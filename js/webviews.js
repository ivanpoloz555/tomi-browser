/* implements selecting webviews, switching between them, and creating new ones. */

var phishingWarningPage = "file://" + __dirname + "/pages/phishing/index.html"; //TODO move this somewhere that actually makes sense
var crashedWebviewPage = "file:///" + __dirname + "/pages/crash/index.html";
var errorPage = "file:///" + __dirname + "/pages/error/index.html"

var webviewBase = document.getElementById("webviews");
var webviewEvents = [];
var webviewIPC = [];

//this only affects newly created webviews, so all bindings should be done on startup

function bindWebviewEvent(event, fn) {
	webviewEvents.push({
		event: event,
		fn: fn,
	})
}

//function is called with (webview, tabId, IPCArguements)

function bindWebviewIPC(name, fn) {
	webviewIPC.push({
		name: name,
		fn: fn,
	})
}

function getWebviewDom(options) {

	var w = document.createElement("webview");
	w.setAttribute("preload", "dist/webview.min.js");

	if (options.url) {
		w.setAttribute("src", urlParser.parse(options.url));
	}

	w.setAttribute("data-tab", options.tabId);

	//if the tab is private, we want to partition it. See http://electron.atom.io/docs/v0.34.0/api/web-view-tag/#partition
	//since tab IDs are unique, we can use them as partition names
	if (tabs.get(options.tabId).private == true) {
		w.setAttribute("partition", options.tabId);
	}

	//webview events

	webviewEvents.forEach(function (i) {
		w.addEventListener(i.event, i.fn);
	});

	w.addEventListener("page-favicon-updated", function (e) {
		var id = this.getAttribute("data-tab");
		updateTabColor(e.favicons, id);
	});

	w.addEventListener("page-title-set", function (e) {
		var tab = this.getAttribute("data-tab");
		tabs.update(tab, {
			title: e.title
		});
		rerenderTabElement(tab);
	});

	w.addEventListener("did-finish-load", function (e) {
		var tab = this.getAttribute("data-tab");
		var url = this.getAttribute("src"); //src attribute changes whenever a page is loaded

		if (url.indexOf("https://") === 0 || url.indexOf("about:") == 0 || url.indexOf("chrome:") == 0 || url.indexOf("file://") == 0) {
			tabs.update(tab, {
				secure: true,
				url: url,
			});
		} else {
			tabs.update(tab, {
				secure: false,
				url: url,
			});
		}

		var isInternalPage = url.indexOf(__dirname) != -1 && url.indexOf(readerView.readerURL) == -1

		if (tabs.get(tab).private == false && !isInternalPage) { //don't save to history if in private mode, or the page is a browser page
			bookmarks.updateHistory(tab);
		}

		rerenderTabElement(tab);

		this.send("loadfinish"); //works around an electron bug (https://github.com/atom/electron/issues/1117), forcing Chromium to always  create the script context

	});

	/*w.on("did-get-redirect-request", function (e) {
		console.log(e.originalEvent);
	});*/

	//open links in new tabs

	w.addEventListener("new-window", function (e) {
		var tab = this.getAttribute("data-tab");
		var currentIndex = tabs.getIndex(tabs.getSelected());

		var newTab = tabs.add({
			url: e.url,
			private: tabs.get(tab).private //inherit private status from the current tab
		}, currentIndex + 1);
		addTab(newTab, {
			enterEditMode: false,
			openInBackground: e.disposition == "background-tab", //possibly open in background based on disposition
		});
	});


	// In embedder page. Send the text content to bookmarks when recieved.
	w.addEventListener('ipc-message', function (e) {
		var w = this;
		var tab = this.getAttribute("data-tab");

		webviewIPC.forEach(function (item) {
			if (item.name == e.channel) {
				item.fn(w, tab, e.args);
			}
		});

		if (e.channel == "bookmarksData") {
			bookmarks.onDataRecieved(e.args[0]);

		} else if (e.channel == "phishingDetected") {
			navigate(this.getAttribute("data-tab"), phishingWarningPage);
		}
	});

	w.addEventListener("contextmenu", webviewMenu.show);

	w.addEventListener("crashed", function (e) {
		var tabId = this.getAttribute("data-tab");

		destroyWebview(tabId);
		tabs.update(tabId, {
			url: crashedWebviewPage
		});

		addWebview(tabId);
		switchToWebview(tabId);
	});

	w.addEventListener("did-fail-load", function (e) {
		if (e.errorCode != -3 && e.validatedURL == e.target.getURL()) {
			navigate(this.getAttribute("data-tab"), errorPage + "?ec=" + encodeURIComponent(e.errorCode) + "&url=" + e.target.getURL());
		}
	});

	w.addEventListener("enter-html-full-screen", function (e) {
		this.classList.add("fullscreen");
	});

	w.addEventListener("leave-html-full-screen", function (e) {
		this.classList.remove("fullscreen");
	})

	return w;

}

/* options: openInBackground: should the webview be opened without switching to it? default is false. 
 */

var WebviewsWithHiddenClass = false;

function addWebview(tabId) {

	var tabData = tabs.get(tabId);

	var webview = getWebviewDom({
		tabId: tabId,
		url: tabData.url
	});

	//this is used to hide the webview while still letting it load in the background
	//webviews are hidden when added - call switchToWebview to show it
	webview.classList.add("hidden");

	webviewBase.appendChild(webview);
}

function switchToWebview(id) {
	var webviews = document.getElementsByTagName("webview");
	for (var i = 0; i < webviews.length; i++) {
		webviews[i].hidden = true;
	}

	var wv = getWebview(id);
	wv.classList.remove("hidden");
	wv.hidden = false;
}

function updateWebview(id, url) {
	getWebview(id).setAttribute("src", urlParser.parse(url));
}

function destroyWebview(id) {
	var w = document.querySelector('webview[data-tab="{id}"]'.replace("{id}", id));
	w.parentNode.removeChild(w);
}

function getWebview(id) {
	return document.querySelector('webview[data-tab="{id}"]'.replace("{id}", id));
}
