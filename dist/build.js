/* tracks the state of tabs */

var tabs = {
	_state: {
		tabs: [],
		selected: null,
	},
	add: function (tab, index) {

		//make sure the tab exists before we create it
		if (!tab) {
			var tab = {};
		}

		var tabId = tab.id || Math.round(Math.random() * 100000000000000000); //you can pass an id that will be used, or a random one will be generated.

		var newTab = {
			url: tab.url || "about:blank",
			title: tab.title || "",
			id: tabId,
			lastActivity: tab.lastActivity || Date.now(),
			secure: tab.secure,
			private: tab.private || false,
			readerable: tab.readerable || false,
			backgroundColor: tab.backgroundColor,
			foregroundColor: tab.foregroundColor,
		}

		if (index) {
			tabs._state.tabs.splice(index, 0, newTab);
		} else {
			tabs._state.tabs.push(newTab);
		}


		return tabId;

	},
	update: function (id, data) {
		if (!tabs.get(id)) {
			throw new ReferenceError("Attempted to update a tab that does not exist.");
		}
		var index = -1;
		for (var i = 0; i < tabs._state.tabs.length; i++) {
			if (tabs._state.tabs[i].id == id) {
				index = i;
			}
		}
		for (var key in data) {
			if (data[key] == undefined) {
				throw new ReferenceError("Key " + key + " is undefined.");
			}
			tabs._state.tabs[index][key] = data[key];
		}
	},
	destroy: function (id) {
		for (var i = 0; i < tabs._state.tabs.length; i++) {
			if (tabs._state.tabs[i].id == id) {
				tabs._state.tabs.splice(i, 1);
				return i;
			}
		}
		return false;
	},
	get: function (id) {
		if (!id) { //no id provided, return an array of all tabs
			//it is important to deep-copy the tab objects when returning them. Otherwise, the original tab objects get modified when the returned tabs are modified (such as when processing a url).
			var tabsToReturn = [];
			for (var i = 0; i < tabs._state.tabs.length; i++) {
				tabsToReturn.push(JSON.parse(JSON.stringify(tabs._state.tabs[i])));
			}
			return tabsToReturn;
		}
		for (var i = 0; i < tabs._state.tabs.length; i++) {
			if (tabs._state.tabs[i].id == id) {
				return tabs._state.tabs[i]
			}
		}
		return undefined;
	},
	getIndex: function (id) {
		for (var i = 0; i < tabs._state.tabs.length; i++) {
			if (tabs._state.tabs[i].id == id) {
				return i;
			}
		}
		return -1;
	},
	getSelected: function () {
		return tabs._state.selected;
	},
	getAtIndex: function (index) {
		return tabs._state.tabs[index] || undefined;
	},
	setSelected: function (id) {
		if (!tabs.get(id)) {
			throw new ReferenceError("Attempted to select a tab that does not exist.");
		}
		tabs._state.selected = id;
	},
	count: function () {
		return tabs._state.tabs.length;
	},
	reorder: function (newOrder) { //newOrder is an array of [tabId, tabId] that indicates the order that tabs should be in
		tabs._state.tabs.sort(function (a, b) {
			return newOrder.indexOf(a.id) - newOrder.indexOf(b.id);
		});
	},

}
;var urlParser = {
	searchBaseURL: "https://duckduckgo.com/?q=%s",
	startingWWWRegex: /www\.(.+\..+\/)/g,
	trailingSlashRegex: /\/$/g,
	isURL: function (url) {
		return url.indexOf("http://") == 0 || url.indexOf("https://") == 0 || url.indexOf("file://") == 0 || url.indexOf("about:") == 0 || url.indexOf("chrome:") == 0 || url.indexOf("data:") == 0;
	},
	isSystemURL: function (url) {
		return url.indexOf("chrome") == 0 || url.indexOf("about:") == 0;
	},
	removeProtocol: function (url) {
		if (!urlParser.isURL(url)) {
			return url;
		}

		var withoutProtocol = url.replace("http://", "").replace("https://", "").replace("file://", ""); //chrome:, about:, data: protocols intentionally not removed

		if (withoutProtocol.indexOf("www.") == 0) {
			return withoutProtocol.replace("www.", "");
		} else {
			return withoutProtocol;
		}
	},
	isURLMissingProtocol: function (url) {
		return url.indexOf(" ") == -1 && url.indexOf(".") > 0;
	},
	parse: function (url) {
		url = url.trim(); //remove whitespace common on copy-pasted url's

		if (!url) {
			return "";
		}
		//if the url starts with a (supported) protocol, do nothing
		if (urlParser.isURL(url)) {
			return url;
		}

		if (url.indexOf("view-source:") == 0) {
			var realURL = url.replace("view-source:", "");

			return "view-source:" + urlParser.parse(realURL);
		}

		//if the url doesn't have a space and has a ., assume it is a url without a protocol
		if (urlParser.isURLMissingProtocol(url)) {
			return "http://" + url;
		}
		//else, do a search
		return urlParser.searchBaseURL.replace("%s", encodeURIComponent(url));
	},
	prettyURL: function (url) {
		var urlOBJ = new URL(url);
		return (urlOBJ.hostname + urlOBJ.pathname).replace(urlParser.startingWWWRegex, "$1").replace(urlParser.trailingSlashRegex, "");
	},
	areEqual: function (url1, url2) {
		try {
			var obj1 = new URL(url1);
			var obj2 = new URL(url2);

			return obj1.hostname == obj2.hostname && obj1.pathname == obj2.pathname
		} catch (e) { //if either of the url's are invalid, the URL constructor will throw an error
			return url1 == url2;
		}
	}
}
;/* implements selecting webviews, switching between them, and creating new ones. */

var phishingWarningPage = "file://" + __dirname + "/pages/phishing/index.html"; //TODO move this somewhere that actually makes sense
var crashedWebviewPage = "file:///" + __dirname + "/pages/crash/index.html";
var errorPage = "file:///" + __dirname + "/pages/error/index.html"

var webviewBase = $("#webviews");
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

	var url = (options || {}).url || "about:blank";

	var w = $("<webview>");
	w.attr("preload", "dist/webview.min.js");
	w.attr("src", urlParser.parse(url));

	w.attr("data-tab", options.tabId);

	//if the tab is private, we want to partition it. See http://electron.atom.io/docs/v0.34.0/api/web-view-tag/#partition
	//since tab IDs are unique, we can use them as partition names
	if (tabs.get(options.tabId).private == true) {
		w.attr("partition", options.tabId);
	}

	//webview events

	webviewEvents.forEach(function (i) {
		w.on(i.event, i.fn);
	});

	w.on("page-favicon-updated", function (e) {
		var id = $(this).attr("data-tab");
		updateTabColor(e.originalEvent.favicons, id);
	});

	w.on("page-title-set", function (e) {
		var tab = $(this).attr("data-tab");
		tabs.update(tab, {
			title: e.originalEvent.title
		});
		rerenderTabElement(tab);
	});

	w.on("did-finish-load", function (e) {
		var tab = $(this).attr("data-tab");
		var url = $(this).attr("src"); //src attribute changes whenever a page is loaded

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

	w.on("new-window", function (e) {
		var tab = $(this).attr("data-tab");
		var currentIndex = tabs.getIndex(tabs.getSelected());

		var newTab = tabs.add({
			url: e.originalEvent.url,
			private: tabs.get(tab).private //inherit private status from the current tab
		}, currentIndex + 1);
		addTab(newTab, {
			focus: false,
			openInBackground: e.originalEvent.disposition == "background-tab", //possibly open in background based on disposition
		});
	});


	// In embedder page. Send the text content to bookmarks when recieved.
	w.on('ipc-message', function (e) {
		var w = this;
		var tab = $(this).attr("data-tab");

		webviewIPC.forEach(function (item) {
			if (item.name == e.originalEvent.channel) {
				item.fn(w, tab, e.originalEvent.args);
			}
		});

		if (e.originalEvent.channel == "bookmarksData") {
			bookmarks.onDataRecieved(e.originalEvent.args[0]);

		} else if (e.originalEvent.channel == "phishingDetected") {
			navigate($(this).attr("data-tab"), phishingWarningPage);
		}
	});

	w.on("contextmenu", webviewMenu.show);

	w.on("crashed", function (e) {
		var tabId = $(this).attr("data-tab");

		destroyWebview(tabId);
		tabs.update(tabId, {
			url: crashedWebviewPage
		});

		addWebview(tabId);
		switchToWebview(tabId);
	});

	w.on("did-fail-load", function (e) {
		if (e.originalEvent.errorCode != -3 && e.originalEvent.validatedURL == e.target.getURL()) {
			navigate($(this).attr("data-tab"), errorPage + "?ec=" + encodeURIComponent(e.originalEvent.errorCode) + "&url=" + e.target.getURL());
		}
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
	webview.addClass("hidden");

	webviewBase.append(webview);
}

function switchToWebview(id, options) {
	$("webview").prop("hidden", true);

	var webview = getWebview(id);
	webview.removeClass("hidden").prop("hidden", false); //in some cases, webviews had the hidden class instead of display:none to make them load in the background. We need to make sure to remove that.

	if (options && options.focus) {
		webview[0].focus();
	}
}

function updateWebview(id, url) {
	getWebview(id).attr("src", urlParser.parse(url));
}

function destroyWebview(id) {
	$('webview[data-tab="{id}"]'.replace("{id}", id)).remove();
}

function getWebview(id) {
	return $('webview[data-tab="{id}"]'.replace("{id}", id));
}
;var remote, Menu, MenuItem, clipboard;

var webviewMenu = {
	cache: {
		event: null,
		webview: null,
	},
	loadFromContextData: function (IPCdata) {

		var tab = tabs.get(tabs.getSelected());

		var event = webviewMenu.cache.event;

		var menu = new Menu();

		//if we have a link (an image source or an href)
		if (IPCdata.src && !isFocusMode) { //new tabs can't be created in focus mode

			//show what the item is

			if (IPCdata.src.length > 60) {
				var caption = IPCdata.src.substring(0, 60) + "..."
			} else {
				var caption = IPCdata.src;
			}

			menu.append(new MenuItem({
				label: caption,
				enabled: false,
			}));
			menu.append(new MenuItem({
				label: 'Open in New Tab',
				click: function () {
					var newTab = tabs.add({
						url: IPCdata.src,
						private: tab.private,
					}, tabs.getIndex(tabs.getSelected()) + 1);

					addTab(newTab, {
						focus: false,
					});
				}
			}));

			//if the current tab isn't private, we want to provide an option to open the link in a private tab

			if (!tab.private) {
				menu.append(new MenuItem({
					label: 'Open in New Private Tab',
					click: function () {
						var newTab = tabs.add({
							url: IPCdata.src,
							private: true,
						}, tabs.getIndex(tabs.getSelected()) + 1)
						addTab(newTab, {
							focus: false,
						});
					}
				}));
			}

			menu.append(new MenuItem({
				type: "separator"
			}));

			menu.append(new MenuItem({
				label: 'Copy link',
				click: function () {
					clipboard.writeText(IPCdata.src);
				}
			}));
		}

		if (IPCdata.selection) {
			menu.append(new MenuItem({
				label: 'Copy',
				click: function () {
					clipboard.writeText(IPCdata.selection);
				}
			}));

			menu.append(new MenuItem({
				type: "separator"
			}));

			menu.append(new MenuItem({
				label: 'Search with DuckDuckGo',
				click: function () {
					var newTab = tabs.add({
						url: "https://duckduckgo.com/?q=" + encodeURIComponent(IPCdata.selection),
						private: tab.private,
					})
					addTab(newTab, {
						focus: false,
					});
				}
			}));
		}

		if (IPCdata.image) {
			menu.append(new MenuItem({
				label: 'View image',
				click: function () {
					navigate(webviewMenu.cache.tab, IPCdata.image);
				}
			}));
		}


		menu.append(new MenuItem({
			label: 'Inspect Element',
			click: function () {
				webviewMenu.cache.webview.inspectElement(event.x, event.y);
			}
		}));

		menu.popup(remote.getCurrentWindow());
	},
	/* cxevent: a contextmenu event. Can be a jquery event or a regular event. */
	show: function (cxevent) {

		if (!remote) { //we lazyload remote, so if it isn't loaded yet, call require()
			remote = require('remote');
			Menu = remote.require('menu');
			MenuItem = remote.require('menu-item');
			clipboard = require("clipboard")
		}

		var event = cxevent.originalEvent || cxevent;
		webviewMenu.cache.event = event;

		var currentTab = tabs.getSelected();
		var webview = getWebview(currentTab)[0]

		webviewMenu.cache.tab = currentTab;
		webviewMenu.cache.webview = webview;

		webview.send("getContextData", {
			x: event.offsetX,
			y: event.offsetY,
		}); //some menu items require recieving data from the page
	}
}

bindWebviewIPC("contextData", function (webview, tabId, arguements) {
	webviewMenu.loadFromContextData(arguements[0]);
})
;/*
steps to creating a bookmark:

 - bookmarks.bookmark(tabId) is called
 - webview_preload.js sends an ipc to webviews.js
 - webviews.js detects the channel is "bookmarksData", and calls bookmarks.onDataRecieved(data)
 - The worker creates a bookmark, and adds it to the search index

*/

var bookmarks = {
	authBookmarkTab: null,
	updateHistory: function (tabId) {
		setTimeout(function () { //this prevents pages that are immediately left from being saved to history, and also gives the page-favicon-updated event time to fire (so the colors saved to history are correct).
			var tab = tabs.get(tabId);
			if (tab) {
				var data = {
					url: tab.url,
					title: tab.title,
					color: tab.backgroundColor,
				}
				bookmarks.historyWorker.postMessage({
					action: "updateHistory",
					data: data
				});
			}

		}, 2000);
	},
	currentCallback: function () {},
	onDataRecieved: function (data) {
		//we can't trust that the data we get from webview_preload.js isn't malicious. Because of this, when we call bookmarks.bookmark(), we set authBookmarkTab to the bookmarked tab id. Then, we check if the url we get back actually matches the url of the tabtab we want to bookmark. This way, we know that the user actually wants to bookmark this url.
		if (!bookmarks.authBookmarkTab || getWebview(bookmarks.authBookmarkTab)[0].getURL() != data.url) {
			throw new Error("Bookmark operation is unauthoritized.");
		}

		data.title = getWebview(bookmarks.authBookmarkTab)[0].getTitle();
		bookmarks.bookmarksWorker.postMessage({
			action: "addBookmark",
			data: data
		})
		bookmarks.authBookmarkTab = null;
	},
	deleteBookmark: function (url) {
		bookmarks.bookmarksWorker.postMessage({
			action: "deleteBookmark",
			data: {
				url: url
			}
		});
	},
	deleteHistory: function (url) {
		bookmarks.historyWorker.postMessage({
			action: "deleteHistory",
			data: {
				url: url
			}
		});
	},
	searchBookmarks: function (text, callback) {
		bookmarks.currentCallback = callback; //save for later, we run in onMessage
		bookmarks.bookmarksWorker.postMessage({
			action: "searchBookmarks",
			text: text,
		});
	},
	searchHistory: function (text, callback) {
		bookmarks.currentHistoryCallback = callback; //save for later, we run in onMessage
		bookmarks.historyWorker.postMessage({
			action: "searchHistory",
			text: text,
		});
	},
	onMessage: function (e) { //assumes this is from a search operation
		if (e.data.scope == "bookmarks") {
			//TODO this (and the rest) should use unique callback id's
			bookmarks.currentCallback(e.data.result);
		} else if (e.data.scope == "history") { //history search
			bookmarks.currentHistoryCallback(e.data.result);
		}
	},
	bookmark: function (tabId) {

		bookmarks.authBookmarkTab = tabId;
		getWebview(tabId)[0].send("sendData");
		//rest happens in onDataRecieved and worker
	},
	toggleBookmarked: function (tabId) { //toggles a bookmark. If it is bookmarked, delete the bookmark. Otherwise, add it.
		var url = tabs.get(tabId).url,
			exists = false;

		bookmarks.searchBookmarks(url, function (d) {

			d.forEach(function (item) {
				if (item.url == url) {
					exists = true;
				}
			});


			if (exists) {
				console.log("deleting bookmark " + tabs.get(tabId).url);
				bookmarks.deleteBookmark(tabs.get(tabId).url);
			} else {
				bookmarks.bookmark(tabId);
			}
		});
	},
	getStar: function (tabId) {
		//alternative icon is fa-bookmark

		var star = $("<i class='fa fa-star-o bookmarks-button theme-text-color'>").attr("data-tab", tabId);

		star.on("click", function (e) {
			$(this).toggleClass("fa-star").toggleClass("fa-star-o");

			bookmarks.toggleBookmarked($(this).attr("data-tab"));
		});

		return bookmarks.renderStar(tabId, star);
	},
	renderStar: function (tabId, star) { //star is optional
		star = star || $('.bookmarks-button[data-tab="{id}"]'.replace("{id}", tabId));

		var currentURL = tabs.get(tabId).url;

		if (!currentURL || currentURL == "about:blank") { //no url, can't be bookmarked
			star.prop("hidden", true);
		} else {
			star.prop("hidden", false);
		}

		//check if the page is bookmarked or not, and update the star to match

		bookmarks.searchBookmarks(currentURL, function (results) {
			if (results && results[0] && results[0].url == currentURL) {
				star.removeClass("fa-star-o").addClass("fa-star");
			} else {
				star.removeClass("fa-star").addClass("fa-star-o");
			}
		});
		return star;
	},
	init: function () {
		bookmarks.historyWorker = new Worker("js/bookmarkshistory/historyworker.js");
		bookmarks.historyWorker.onmessage = bookmarks.onMessage;

		bookmarks.bookmarksWorker = new Worker("js/bookmarkshistory/bookmarksworker.js");
		bookmarks.bookmarksWorker.onmessage = bookmarks.onMessage;
	},

}

bookmarks.init();
;/* common to webview, tabrenderer, etc */

function navigate(tabId, newURL) {
	newURL = urlParser.parse(newURL);

	tabs.update(tabId, {
		url: newURL
	});

	updateWebview(tabId, newURL);

	leaveTabEditMode({
		blur: true
	});
}

function switchToNextTab(oldIndex) {
	var nextTab = tabs.getAtIndex(oldIndex + 1) || tabs.getAtIndex(oldIndex - 1);
	if (nextTab) {
		switchToTab(nextTab.id);
	}
}

function destroyTab(id) {

	getTabElement(id).remove(); //remove the actual tab element
	var t = tabs.destroy(id); //remove from state - returns the index of the destroyed tab
	destroyWebview(id); //remove the webview

}

/* switches to a tab - update the webview, state, tabstrip, etc. */

function switchToTab(id) {

	/* tab switching disabled in focus mode */
	if (isFocusMode) {
		showFocusModeError();
		return;
	}

	leaveTabEditMode();

	setActiveTabElement(id);
	switchToWebview(id, {
		focus: !isExpandedMode //trying to focus a webview while in expanded mode breaks the page
	});

	tabs.setSelected(id);

	var tabData = tabs.get(id);
	setColor(tabData.backgroundColor, tabData.foregroundColor);

	//we only want to mark the tab as active if someone actually interacts with it. If it is clicked on and then quickly clicked away from, it should still be marked as inactive

	setTimeout(function () {
		if (tabs.get(id) && tabs.getSelected() == id) {
			tabs.update(id, {
				lastActivity: Date.now(),
			});
			tabActivity.refresh();
		}
	}, 2500);

	sessionRestore.save();

}
;var DDGSearchURLRegex = /^https:\/\/duckduckgo.com\/\?q=([^&]*).*/g,
	trailingSlashRegex = /\/$/g,
	plusRegex = /\+/g;

var currentACItem = null;
var deleteKeyPressed = false;

var maxHistoryResults = 4;

function searchbarAutocomplete(text, input, historyResults) {
	if (!text) {
		currentACItem = null;
		return;
	}

	if (text == searchbarCachedText && input[0].selectionStart != input[0].selectionEnd) { //if nothing has actually changed, don't try to autocomplete
		return;
	}
	//if we moved the selection, we don't want to autocomplete again
	if (didFireKeydownSelChange) {
		return;
	}

	var didAutocomplete = false;

	for (var i = 0; !didAutocomplete && i < historyResults.length; i++) { //we only want to autocomplete the first item that matches
		didAutocomplete = autocompleteResultIfNeeded(input, historyResults[i]); //this returns true or false depending on whether the item was autocompleted or not
	}
}

function autocompleteResultIfNeeded(input, result) {

	//figure out if we should autocomplete based on the title

	DDGSearchURLRegex.lastIndex = 0;
	shouldAutocompleteTitle = DDGSearchURLRegex.test(result.url);

	if (shouldAutocompleteTitle) {
		result.title = decodeURIComponent(result.url.replace(DDGSearchURLRegex, "$1").replace(plusRegex, " "));
	}

	var text = getValue(input); //make sure the input hasn't changed between start and end of query
	var hostname = new URL(result.url).hostname;

	var possibleAutocompletions = [ //the different variations of the URL we can autocomplete
		hostname, //we start with the domain
		(hostname + "/").replace(urlParser.startingWWWRegex, "$1").replace("/", ""), //if that doesn't match, try the hostname without the www instead. The regex requires a slash at the end, so we add one, run the regex, and then remove it
		urlParser.prettyURL(result.url), //then try the whole url
		urlParser.removeProtocol(result.url), //then try the url with querystring
		result.url, //then just try the url with protocol
	]

	if (shouldAutocompleteTitle) {
		possibleAutocompletions.push(result.title);
	}


	for (var i = 0; i < possibleAutocompletions.length; i++) {
		if (!deleteKeyPressed && possibleAutocompletions[i].toLowerCase().indexOf(text.toLowerCase()) == 0) { //we can autocomplete the item

			input.val(possibleAutocompletions[i]);
			input.get(0).setSelectionRange(text.length, possibleAutocompletions[i].length);

			if (i < 2) { //if we autocompleted a domain, the cached item should be the domain, not the full url
				var url = new URL(result.url);
				currentACItem = url.protocol + "//" + url.hostname + "/";
			} else {
				currentACItem = result.url;
			}
			return true;
		}
	}

	//nothing was autocompleted

	currentACItem = null;
	return false;
}

var showHistoryResults = throttle(function (text, input, maxItems) {

	if (!text && input[0].value) { //if the entire input is highlighted (such as when we first focus the input), don't show anything
		return;
	}

	if (text) {
		text = text.trim();
	}

	bookmarks.searchHistory(text, function (results) {

		var showedTopAnswer = false;

		maxItems = maxItems || maxHistoryResults;

		//if there is no text, only history results will be shown, so we can assume that 4 results should be shown.
		if (!text) {
			maxItems = 4;
		}

		historyarea.empty();

		if (topAnswerarea.get(0).getElementsByClassName("history-item").length > 0) {
			topAnswerarea.empty();
		}

		searchbarAutocomplete(text, input, results);

		if (results.length < 10) { //if we don't have a lot of history results, show search suggestions
			limitSearchSuggestions(results.length);
			maxItems = 3;
			showSearchSuggestions(text, input);
		} else if (text.indexOf("!") == -1) { //if we have a !bang, always show results
			serarea.empty();
		}

		var resultsShown = 0;

		//we will never have more than 5 results, so we don't need to create more DOM elements than that

		results = results.splice(0, 5);

		results.forEach(function (result) {

			var shouldAutocompleteTitle = false;

			var title = result.title;
			var icon = $("<i class='fa fa-globe'>");

			//special formatting for ddg search history results

			DDGSearchURLRegex.lastIndex = 0;

			if (DDGSearchURLRegex.test(result.url)) {

				//the history item is a search, display it like a search suggestion
				title = decodeURIComponent(result.url.replace(DDGSearchURLRegex, "$1").replace(plusRegex, " "));
				icon = $("<i class='fa fa-search'>");
				shouldAutocompleteTitle = true; //previous searches can be autocompleted
			}

			//if we're doing a bang search, but the item isn't a web search, it probably isn't useful, so we shouldn't show it
			if (!shouldAutocompleteTitle && text.indexOf("!") == 0) {
				return;
			}


			var item = $("<div class='result-item history-item' tabindex='-1'>").append($("<span class='title'>").text(getRealTitle(title))).on("click", function (e) {
				openURLFromsearchbar(e, result.url);
			});

			item.attr("data-url", result.url);

			icon.prependTo(item);

			if (!shouldAutocompleteTitle && result.title != result.url) { //if we're autocompleting titles, this is a search, and we don't want to show the URL. If the item title and URL are the same (meaning the item has no title), there is no point in showing a URL since we are showing it in the title field.

				$("<span class='secondary-text'>").text(urlParser.prettyURL(result.url)).appendTo(item);
			}

			if (resultsShown >= maxItems) { //only show up to n history items
				item.prop("hidden", true).addClass("unfocusable");
			}

			if (urlParser.areEqual(currentACItem, result.url) && resultsShown < maxItems && !showedTopAnswer) { //the item is being autocompleted, highlight it
				item.addClass("fakefocus");
				requestAnimationFrame(function () {
					item.appendTo(topAnswerarea);
				});
				showedTopAnswer = true;
			} else {
				requestAnimationFrame(function () {
					item.appendTo(historyarea);
				});
			}


			resultsShown++;

		});

		//show a top answer item if we did domain autocompletion

		if (currentACItem && !showedTopAnswer) {
			var item = $("<div class='result-item history-item fakefocus' tabindex='-1'>").append($("<span class='title'>").text(urlParser.prettyURL(currentACItem))).on("click", function (e) {
				openURLFromsearchbar(e, currentACItem);
			});

			$("<i class='fa fa-globe'>").prependTo(item);

			requestAnimationFrame(function () {
				item.appendTo(topAnswerarea);
			});
		}
	});
}, 50);

function limitHistoryResults(maxItems) {
	maxHistoryResults = Math.min(4, Math.max(maxItems, 2));

	historyarea.find(".result-item:nth-child(n+{items})".replace("{items}", maxHistoryResults + 1)).prop("hidden", true).addClass("unfocusable");
}
;function addBookmarkItem(result) {
	//create the basic item
	//getRealTitle is defined in searchbar.js
	var item = $("<div class='result-item' tabindex='-1'>").append($("<span class='title'>").text(getRealTitle(result.title))).on("click", function (e) {
		openURLFromsearchbar(e, result.url);
	});

	$("<i class='fa fa-star'>").prependTo(item);

	var span = $("<span class='secondary-text'>").text(urlParser.prettyURL(result.url));


	if (result.extraData && result.extraData.metadata) {
		var captionSpans = [];

		if (result.extraData.metadata.rating) {
			captionSpans.push($("<span class='md-info'>").text(result.extraData.metadata.rating));
		}
		if (result.extraData.metadata.price) {
			captionSpans.push($("<span class='md-info'>").text(result.extraData.metadata.price));
		}
		if (result.extraData.metadata.location) {
			captionSpans.push($("<span class='md-info'>").text(result.extraData.metadata.location));
		}


		captionSpans.reverse().forEach(function (s) {
			span.prepend(s);
		})
	}


	span.appendTo(item);

	item.appendTo(bookmarkarea);

	item.attr("data-url", result.url);
}

var showBookmarkResults = throttle(function (text) {
	if (text.length < 5 || text.indexOf("!") == 0) { //if there is not enough text, or we're doing a bang search, don't show results
		limitHistoryResults(5);
		bookmarkarea.empty();
		return;
	}

	bookmarks.searchBookmarks(text, function (results) {
		bookmarkarea.empty();
		var resultsShown = 1;
		results.splice(0, 2).forEach(function (result) {
			//as more results are added, the threshold for adding another one gets higher
			if (result.score > Math.max(0.0004, 0.0016 - (0.00012 * Math.pow(1.25, text.length))) && (resultsShown == 1 || text.length > 6)) {
				requestAnimationFrame(function () {
					addBookmarkItem(result);
				});
				resultsShown++;
			}

		});
		limitHistoryResults(5 - resultsShown); //if we have lots of bookmarks, don't show as many regular history items

	});
}, 400);

var showAllBookmarks = function () {
	bookmarks.searchBookmarks("", function (results) {

		results.sort(function (a, b) {
			//http://stackoverflow.com/questions/6712034/sort-array-by-firstname-alphabetically-in-javascript
			if (a.url < b.url) return -1;
			if (a.url > b.url) return 1;
			return 0;
		});
		results.forEach(addBookmarkItem);
	});
}
;var BANG_REGEX = /!\w+/g;
var serarea = $("#searchbar .search-engine-results");
var iaarea = $("#searchbar .instant-answer-results");
var topAnswerarea = $("#searchbar .top-answer-results");
var suggestedsitearea = $("#searchbar .ddg-site-results");

const minSearchSuggestions = 2;
const maxSearchSuggestions = 4;
var currentSuggestionLimit = maxSearchSuggestions;

/* custom answer layouts */

var IAFormats = {
	color_code: function (searchText, answer) {
		var alternateFormats = [answer.data.rgb, answer.data.hslc, answer.data.cmyb];

		if (searchText.indexOf("#") == -1) { //if the search is not a hex code, show the hex code as an alternate format
			alternateFormats.unshift(answer.data.hexc);
		}

		var item = $("<div class='result-item indent' tabindex='-1'>");
		$("<span class='title'>").text(searchText).appendTo(item);

		$("<div class='result-icon color-circle'>").css("background-color", "#" + answer.data.hex_code).prependTo(item);

		$("<span class='description-block'>").text(alternateFormats.join(" " + METADATA_SEPARATOR + " ")).appendTo(item);

		return item;
	},
	minecraft: function (searchText, answer) {

		var item = $("<div class='result-item indent' tabindex='-1'>");

		$("<span class='title'>").text(answer.data.title).appendTo(item);
		$("<img class='result-icon image'>").attr("src", answer.data.image).prependTo(item);
		$("<span class='description-block'>").text(answer.data.description + " " + answer.data.subtitle).appendTo(item);

		return item;
	},
	figlet: function (searchText, answer) {
		var formattedAnswer = removeTags(answer).replace("Font: standard", "");

		var item = $("<div class='result-item indent' tabindex='-1'>");
		var desc = $("<span class='description-block'>").text(formattedAnswer).appendTo(item);

		//display the data correctly
		desc.css({
			"white-space": "pre-wrap",
			"font-family": "monospace",
			"max-height": "10em",
			"-webkit-user-select": "auto",
		});

		return item;

	},
}

//this is triggered from history.js - we only show search suggestions if we don't have history results
window.showSearchSuggestions = throttle(function (text, input) {

	if (!text) {
		return;
	}

	//we don't show search suggestions in private tabs, since this would send typed text to DDG

	if (tabs.get(tabs.getSelected()).private) {
		return;
	}

	if (BANG_REGEX.test(text)) { //we're typing a bang
		var bang = text.match(BANG_REGEX)[0];

		var bangACSnippet = cachedBangSnippets[bang];

	}
	$.ajax("https://ac.duckduckgo.com/ac/?q=" + encodeURIComponent(text))
		.done(function (results) {

			serarea.find(".result-item").addClass("old");

			if (results && results[0] && results[0].snippet) { //!bang search - ddg api doesn't have a good way to detect this

				results.splice(0, 5).forEach(function (result) {
					cachedBangSnippets[result.phrase] = result.snippet;

					//autocomplete the bang, but allow the user to keep typing

					var item = $("<div class='result-item' tabindex='-1'>").append($("<span class='title'>").text(result.snippet)).on("click", function () {
						setTimeout(function () { //if the click was triggered by the keydown, focusing the input and then keyup will cause a navigation. Wait a bit for keyup before focusing the input again.
							input.val(result.phrase + " ").get(0).focus();
						}, 100);
					});

					$("<span class='secondary-text'>").text(result.phrase).appendTo(item);

					$("<img class='result-icon inline'>").attr("src", result.image).prependTo(item);

					item.appendTo(serarea);
				});

			} else if (results) {
				results = results.splice(0, currentSuggestionLimit);

				results.forEach(function (result) {
					var title = result.phrase;
					if (BANG_REGEX.test(result.phrase) && bangACSnippet) {
						title = result.phrase.replace(BANG_REGEX, "");
						var secondaryText = "Search on " + bangACSnippet;
					}
					var item = $("<div class='result-item iadata-onfocus' tabindex='-1'>").append($("<span class='title'>").text(title)).on("click", function (e) {
						openURLFromsearchbar(e, result.phrase);
					});

					item.appendTo(serarea);

					if (urlParser.isURL(result.phrase) || urlParser.isURLMissingProtocol(result.phrase)) { //website suggestions
						$("<i class='fa fa-globe'>").prependTo(item);
					} else { //regular search results
						$("<i class='fa fa-search'>").prependTo(item);
					}

					if (secondaryText) {
						$("<span class='secondary-text'>").text(secondaryText).appendTo(item);
					}
				});
			}

			serarea.find(".old").remove();
		});

}, 500);

/* this is called from historySuggestions. When we find history results, we want to limit search suggestions to 2 so the searchbar doesn't get too large. */

var limitSearchSuggestions = function (itemsToRemove) {
	var itemsLeft = Math.max(minSearchSuggestions, maxSearchSuggestions - itemsToRemove);
	currentSuggestionLimit = itemsLeft;
	serarea.find(".result-item:nth-child(n+{items})".replace("{items}", itemsLeft + 1)).remove();
}

window.showInstantAnswers = debounce(function (text, input, options) {

	if (!text) {
		iaarea.empty();
		suggestedsitearea.empty();
		return;
	}

	options = options || {};

	//don't make useless queries
	if (urlParser.isURLMissingProtocol(text)) {
		return;
	}

	//don't send typed text in private mode
	if (tabs.get(tabs.getSelected()).private) {
		return;
	}

	//instant answers

	iaarea.find(".result-item").addClass("old");
	suggestedsitearea.find(".result-item").addClass("old");

	if (text.length > 3) {

		$.getJSON("https://api.duckduckgo.com/?skip_disambig=1&format=json&q=" + encodeURIComponent(text), function (res) {

			//if value has changed, don't show results
			if (text != getValue(input) && !options.alwaysShow) {
				return;
			}

			iaarea.find(".result-item").addClass("old");
			suggestedsitearea.find(".result-item").addClass("old");

			//if there is a custom format for the answer, use that
			if (IAFormats[res.AnswerType]) {
				item = IAFormats[res.AnswerType](text, res.Answer);
			} else {

				if (res.Abstract || res.Answer) {
					var item = $("<div class='result-item indent' tabindex='-1'>");

					if (res.Answer) {
						item.text(removeTags(res.Answer));
					} else {
						item.text(res.Heading);
					}

					if (res.Image && !res.ImageIsLogo) {
						$("<img class='result-icon image low-priority-image'>").attr("src", res.Image).prependTo(item);
					}

					$("<span class='description-block'>").text(removeTags(res.Abstract) || "Answer").appendTo(item);

				}
			}


			if (item) {
				item.on("click", function (e) {
					openURLFromsearchbar(e, res.AbstractURL || text);
				});

				//answers are more relevant, they should be displayed at the top
				if (res.Answer) {
					topAnswerarea.empty();
					item.appendTo(topAnswerarea);
				} else {
					item.appendTo(iaarea);
				}

			}

			//suggested site links


			if (res.Results && res.Results[0] && res.Results[0].FirstURL) {

				var itemsWithSameURL = historyarea.find('.result-item[data-url="{url}"]'.replace("{url}", res.Results[0].FirstURL));

				if (itemsWithSameURL.length == 0) {

					var url = urlParser.removeProtocol(res.Results[0].FirstURL).replace(trailingSlashRegex, "");

					var item = $("<div class='result-item' tabindex='-1'>").append($("<span class='title'>").text(url)).on("click", function (e) {

						openURLFromsearchbar(e, res.Results[0].FirstURL);
					});

					$("<i class='fa fa-globe'>").prependTo(item);

					$("<span class='secondary-text'>").text("Suggested site").appendTo(item);

					item.appendTo(suggestedsitearea);
				}
			}

			//if we're showing a location, show a "view on openstreetmap" link

			var entitiesWithLocations = ["location", "country", "u.s. state", "protected area"]

			if (entitiesWithLocations.indexOf(res.Entity) != -1) {
				var item = $("<div class='result-item' tabindex='-1'>");

				$("<i class='fa fa-search'>").appendTo(item);
				$("<span class='title'>").text(res.Heading).appendTo(item);
				$("<span class='secondary-text'>Search on OpenStreetMap</span>").appendTo(item);

				item.on("click", function (e) {
					openURLFromsearchbar(e, "https://www.openstreetmap.org/search?query=" + encodeURIComponent(res.Heading));
				});

				item.prependTo(iaarea);
			}

			if (options.destroyPrevious != false || item) {
				iaarea.find(".old").remove();
				suggestedsitearea.find(".old").remove();
			}


		});
	} else {
		iaarea.find(".old").remove(); //we still want to remove old items, even if we didn't make a new request
		suggestedsitearea.find(".old").remove();
	}

}, 450);
;var spacesRegex = /[\s._/-]/g; //copied from historyworker.js

var stringScore = require("string_score");

var searchOpenTabs = function (searchText) {

	opentabarea.empty();

	if (searchText.length < 3) {
		return;
	}

	var matches = [],
		selTab = tabs.getSelected();

	tabs.get().forEach(function (item) {
		if (item.id == selTab || !item.title || item.url == "about:blank") {
			return;
		}

		item.url = urlParser.removeProtocol(item.url); //don't search protocols

		var exactMatch = item.title.indexOf(searchText) != -1 || item.url.indexOf(searchText) != -1
		var fuzzyMatch = item.title.substring(0, 50).score(searchText, 0.5) > 0.4 || item.url.score(searchText, 0.5) > 0.4;

		if (exactMatch || fuzzyMatch) {
			matches.push(item);
		}
	});

	matches.splice(0, 2).sort(function (a, b) {
		return b.title.score(searchText, 0.5) - a.title.score(searchText, 0.5);
	}).forEach(function (tab) {
		var item = $("<div class='result-item' tabindex='-1'>").append($("<span class='title'>").text(tab.title))
		$("<span class='secondary-text'>").text(urlParser.removeProtocol(tab.url).replace(trailingSlashRegex, "")).appendTo(item);

		$("<i class='fa fa-external-link-square'>").attr("title", "Switch to Tab").prependTo(item); //TODO better icon

		item.on("click", function () {
			//if we created a new tab but are switching away from it, destroy the current (empty) tab
			if (tabs.get(tabs.getSelected()).url == "about:blank") {
				destroyTab(tabs.getSelected(), {
					switchToTab: false
				});
			}
			switchToTab(tab.id);
		});

		item.appendTo(opentabarea);
	});
}
;var searchbarCachedText = "";
var METADATA_SEPARATOR = "·";
var didFireKeydownSelChange = false;
var currentsearchbarInput;

//cache duckduckgo bangs so we make fewer network requests
var cachedBangSnippets = {};

//https://remysharp.com/2010/07/21/throttling-function-calls#

function throttle(fn, threshhold, scope) {
	threshhold || (threshhold = 250);
	var last,
		deferTimer;
	return function () {
		var context = scope || this;

		var now = +new Date,
			args = arguments;
		if (last && now < last + threshhold) {
			// hold on to it
			clearTimeout(deferTimer);
			deferTimer = setTimeout(function () {
				last = now;
				fn.apply(context, args);
			}, threshhold);
		} else {
			last = now;
			fn.apply(context, args);
		}
	};
}

function debounce(fn, delay) {
	var timer = null;
	return function () {
		var context = this,
			args = arguments;
		clearTimeout(timer);
		timer = setTimeout(function () {
			fn.apply(context, args);
		}, delay);
	};
}

function removeTags(text) {
	return text.replace(/<.*?>/g, "");
}

/* this is used by navbar-tabs.js. When a url is entered, endings such as ? need to be parsed and removed. */
function parsesearchbarURL(url) {
	//always use a search engine if the query starts with "?"

	if (url.indexOf("?") == 0) {
		url = urlParser.searchBaseURL.replace("%s", encodeURIComponent(url.replace("?", "")));
	}

	if (url.indexOf("^") == 0) {
		url = url.replace("^", "");
	}

	if (url.indexOf("*") == 0) {
		url = url.replace("*", "");
	}

	return url;
}

function openURLInBackground(url) { //used to open a url in the background, without leaving the searchbar
	var newTab = tabs.add({
		url: url,
		private: tabs.get(tabs.getSelected()).private
	}, tabs.getIndex(tabs.getSelected()) + 1);
	addTab(newTab, {
		focus: false,
		openInBackground: true,
		leaveEditMode: false,
	});
	$(".result-item:focus").blur(); //remove the highlight from an awesoembar result item, if there is one
}

//when clicking on a result item, this function should be called to open the URL

function openURLFromsearchbar(event, url) {
	if (event.metaKey) {
		openURLInBackground(url);
		return true;
	} else {
		navigate(tabs.getSelected(), url);
		return false;
	}
}


//attempts to shorten a page title, removing useless text like the site name

function getRealTitle(text) {

	//don't try to parse URL's
	if (urlParser.isURL(text)) {
		return text;
	}

	var possibleCharacters = ["|", ":", " - ", " — "];

	for (var i = 0; i < possibleCharacters.length; i++) {

		var char = possibleCharacters[i];
		//match url's of pattern: title | website name
		var titleChunks = text.split(char);

		if (titleChunks.length >= 2) {
			titleChunks[0] = titleChunks[0].trim();
			titleChunks[1] = titleChunks[1].trim();

			if (titleChunks[1].length < 5 || titleChunks[1].length / titleChunks[0].length <= 0.5) {
				return titleChunks[0]
			}
		}
	}

	//fallback to the regular title

	return text;
}

var searchbar = $("#searchbar");
var historyarea = searchbar.find(".history-results");
var bookmarkarea = searchbar.find(".bookmark-results");
var opentabarea = searchbar.find(".opentab-results");

function clearsearchbar() {
	opentabarea.empty();
	topAnswerarea.empty();
	bookmarkarea.empty();
	historyarea.empty();
	iaarea.empty();
	suggestedsitearea.empty();
	serarea.empty();

	//prevent memory leak
	cachedBangSnippets = [];
}

function showSearchbar(triggerInput) {
	searchbarCachedText = triggerInput.val();
	$(document.body).addClass("searchbar-shown");

	clearsearchbar();


	searchbar.prop("hidden", false);

	currentsearchbarInput = triggerInput;

}

//gets the typed text in an input, ignoring highlighted suggestions

function getValue(input) {
	var text = input.val();
	return text.replace(text.substring(input[0].selectionStart, input[0].selectionEnd), "");
}

function hidesearchbar() {
	currentsearchbarInput = null;
	$(document.body).removeClass("searchbar-shown");
	searchbar.prop("hidden", true);
	cachedBangSnippets = {};
}
var showSearchbarResults = function (text, input, event) {

	if (event && event.metaKey) {
		return;
	}

	deleteKeyPressed = event && event.keyCode == 8;

	//find the real input value, accounting for highlighted suggestions and the key that was just pressed

	var v = input[0].value;

	//delete key doesn't behave like the others, String.fromCharCode returns an unprintable character (which has a length of one)

	if (event && event.keyCode != 8) {

		text = v.substring(0, input[0].selectionStart) + String.fromCharCode(event.keyCode) + v.substring(input[0].selectionEnd + 1, v.length).trim();

	} else {
		txt = v;
	}

	console.log("searchbar: ", "'" + text + "'", text.length);

	//there is no text, show only topsites
	if (text.length < 1) {
		showHistoryResults("", input);
		clearsearchbar();
		return;
	}

	//when you start with ?, always search with duckduckgo

	if (text.indexOf("?") == 0) {
		clearsearchbar();

		maxSearchSuggestions = 5;
		showSearchSuggestions(text.replace("?", ""), input);
		return;
	}

	//when you start with ^, always search history (only)

	if (text.indexOf("^") == 0) {
		clearsearchbar();
		showHistoryResults(text.replace("^", ""), input);
		return;
	}

	//when you start with *, always search bookmarks (only)

	if (text.indexOf("*") == 0) {
		clearsearchbar();
		showBookmarkResults(text.replace("*", ""), input);
		return;
	}

	//show searchbar results


	//show results if a !bang search is occuring
	if (text.indexOf("!") == 0) {

		showSearchSuggestions(text, input);
	}

	showBookmarkResults(text);

	showHistoryResults(text, input);
	showInstantAnswers(text, input);
	searchOpenTabs(text, input);

	//update cache
	searchbarCachedText = text;
};

function focussearchbarItem(options) {
	options = options || {}; //fallback if options is null
	var previous = options.focusPrevious;
	var allItems = $("#searchbar .result-item:not(.unfocusable)");
	var currentItem = $("#searchbar .result-item:focus, .result-item.fakefocus");
	var index = allItems.index(currentItem);
	var logicalNextItem = allItems.eq((previous) ? index - 1 : index + 1);

	searchbar.find(".fakefocus").removeClass("fakefocus"); //clear previously focused items

	if (currentItem[0] && logicalNextItem[0]) { //an item is focused and there is another item after it, move onto the next one
		logicalNextItem.get(0).focus();
	} else if (currentItem[0]) { //the last item is focused, focus the searchbar again
		getTabElement(tabs.getSelected()).getInput().get(0).focus();
	} else { // no item is focused.
		$("#searchbar .result-item").first().get(0).focus();
	}

	var focusedItem = $("#searchbar .result-item:focus");

	if (focusedItem.hasClass("iadata-onfocus")) {

		setTimeout(function () {
			if (focusedItem.is(":focus")) {
				var itext = focusedItem.find(".title").text();

				showInstantAnswers(itext, currentsearchbarInput, {
					alwaysShow: true,
					destroyPrevious: false,
				});
			}
		}, 200);
	}
}

//return key on result items should trigger click 
//tab key or arrowdown key should focus next item
//arrowup key should focus previous item

searchbar.on("keydown", ".result-item", function (e) {
	if (e.keyCode == 13) {
		$(this).trigger("click");
	} else if (e.keyCode == 9 || e.keyCode == 40) { //tab or arrowdown key
		e.preventDefault();
		focussearchbarItem();
	} else if (e.keyCode == 38) {
		e.preventDefault();
		focussearchbarItem({
			focusPrevious: true
		});
	}
});

//swipe left on history items to delete them

var lastItemDeletion = Date.now();

searchbar.on("mousewheel", ".history-results .result-item, .top-answer-results .result-item", function (e) {
	var self = $(this)
	if (e.originalEvent.deltaX > 50 && e.originalEvent.deltaY < 3 && self.attr("data-url") && Date.now() - lastItemDeletion > 700) {
		lastItemDeletion = Date.now();
		self.animate({
			opacity: "0",
			"margin-left": "-100%"
		}, 200, function () {
			self.remove();
			bookmarks.deleteHistory(self.attr("data-url"));
			lastItemDeletion = Date.now();
		});
	}
});

//when we get keywords data from the page, we show those results in the searchbar

bindWebviewIPC("keywordsData", function (webview, tabId, arguements) {

	var data = arguements[0];

	var itemsCt = 0;

	var itemsShown = [];


	data.entities.forEach(function (item, index) {

		//ignore one-word items, they're usually useless
		if (!/\s/g.test(item.trim())) {
			return;
		}

		if (itemsCt >= 5 || itemsShown.indexOf(item.trim()) != -1) {
			return;
		}

		var div = $("<div class='result-item iadata-onfocus' tabindex='-1'>").append($("<span class='title'>").text(item)).on("click", function (e) {
			if (e.metaKey) {
				openURLInBackground(item);
			} else {
				navigate(tabs.getSelected(), item);
			}
		});

		$("<i class='fa fa-search'>").prependTo(div);

		div.appendTo(serarea);

		itemsCt++;
		itemsShown.push(item.trim());
	});
});
;var readerView = {
	readerURL: "file://" + __dirname + "/reader/index.html",
	getButton: function (tabId) {
		//TODO better icon
		return $("<i class='fa fa-align-left reader-button'>").attr("data-tab", tabId).attr("title", "Enter reader view");
	},
	updateButton: function (tabId) {
		var button = $('.reader-button[data-tab="{id}"]'.replace("{id}", tabId));
		var tab = tabs.get(tabId);

		button.off();

		if (tab.isReaderView) {
			button.addClass("is-reader").attr("title", "Exit reader view");
			button.on("click", function (e) {
				e.stopPropagation();
				readerView.exit(tabId);
			});
			return;
		} else {
			button.removeClass("is-reader").attr("title", "Enter reader view");
		}

		if (tab.readerable) {
			button.addClass("can-reader");
			button.on("click", function (e) {
				e.stopPropagation();
				readerView.enter(tabId);
			});
		} else {
			button.removeClass("can-reader");
		}
	},
	enter: function (tabId) {
		navigate(tabId, readerView.readerURL + "?url=" + tabs.get(tabId).url);
		tabs.update(tabId, {
			isReaderView: true
		});
	},
	exit: function (tabId) {
		navigate(tabId, tabs.get(tabId).url.split("?url=")[1]);
		tabs.update(tabId, {
			isReaderView: false
		})
	}
}

//update the reader button on page load

bindWebviewEvent("did-finish-load", function (e) {
	var tab = $(this).attr("data-tab"),
		url = $(this).attr("src");

	if (url.indexOf(readerView.readerURL) == 0) {
		tabs.update(tab, {
			isReaderView: true
		})
	} else {
		tabs.update(tab, {
			isReaderView: false
		})
	}

	//assume the new page can't be readered, we'll get another message if it can

	tabs.update(tab, {
		readerable: false,
	});
	readerView.updateButton(tab);

});

bindWebviewIPC("canReader", function (webview, tab) {
	tabs.update(tab, {
		readerable: true
	});
	readerView.updateButton(tab);
});
;/* fades out tabs that are inactive */

var tabActivity = {
	minFadeAge: 330000,
	refresh: function () {

		requestAnimationFrame(function () {
			var tabSet = tabs.get(),
				selected = tabs.getSelected(),
				time = Date.now();


			tabSet.forEach(function (tab) {
				if (selected == tab.id) { //never fade the current tab
					getTabElement(tab.id).removeClass("fade");
					return;
				}
				if (time - tab.lastActivity > tabActivity.minFadeAge) { //the tab has been inactive for greater than minActivity, and it is not currently selected
					getTabElement(tab.id).addClass("fade");
				} else {
					getTabElement(tab.id).removeClass("fade");
				}
			});
		});
	},
	init: function () {
		setInterval(tabActivity.refresh, 7500);
	}
}
tabActivity.init();
;function getColor(url, callback) {

	colorExtractorImage.onload = function (e) {
		var canvas = document.createElement("canvas");
		var context = canvas.getContext("2d");

		var w = colorExtractorImage.width,
			h = colorExtractorImage.height;
		canvas.width = w
		canvas.height = h

		var offset = Math.max(1, Math.round(0.00032 * w * h));

		context.drawImage(colorExtractorImage, 0, 0, w, h);

		var data = context.getImageData(0, 0, w, h).data;

		var pixels = {};

		var d, add, sum;

		for (var i = 0; i < data.length; i += 4 * offset) {
			d = Math.round(data[i] / 5) * 5 + "," + Math.round(data[i + 1] / 5) * 5 + "," + Math.round(data[i + 2] / 5) * 5;

			add = 1;
			sum = data[i] + data[i + 1] + data[i + 2]

			//very dark or light pixels shouldn't be counted as heavily
			if (sum < 310) {
				add = 0.35;
			}

			if (sum < 50) {
				add = 0.01;
			}

			if (data[i] > 210 || data[i + 1] > 210 || data[i + 2] > 210) {
				add = 0.5 - (0.0001 * sum)
			}

			if (pixels[d]) {
				pixels[d] = pixels[d] + add;
			} else {
				pixels[d] = add;
			}
		}

		//find the largest pixel set
		var largestPixelSet = null;
		var ct = 0;

		for (var k in pixels) {
			if (k == "255,255,255" || k == "0,0,0") {
				pixels[k] *= 0.05;
			}
			if (pixels[k] > ct) {
				largestPixelSet = k;
				ct = pixels[k];
			}
		}

		var res = largestPixelSet.split(",");

		for (var i = 0; i < res.length; i++) {
			res[i] = parseInt(res[i]);
		}

		callback(res);

	}

	colorExtractorImage.src = url;
}

var colorExtractorImage = document.createElement("img");

const defaultColors = {
	private: ["rgb(58, 44, 99)", "white"],
	regular: ["rgb(255, 255, 255)", "black"]
}

var hours = new Date().getHours() + (new Date().getMinutes() / 60);

//we cache the hours so we don't have to query every time we change the color

setInterval(function () {
	var d = new Date();
	hours = d.getHours() + (d.getMinutes() / 60);
}, 4 * 60 * 1000);

function updateTabColor(favicons, tabId) {

	//special color scheme for private tabs
	if (tabs.get(tabId).private == true) {
		tabs.update(tabId, {
			backgroundColor: "#3a2c63",
			foregroundColor: "white",
		})

		if (tabId == tabs.getSelected()) {
			setColor("#3a2c63", "white");
		}
		return;
	}
	requestIdleCallback(function () {
		getColor(favicons[0], function (c) {

			//dim the colors late at night or early in the morning
			var colorChange = 1;
			if (hours > 20) {
				colorChange -= 0.015 * Math.pow(2.75, hours - 20);
			} else if (hours < 6.5) {
				colorChange -= -0.15 * Math.pow(1.36, hours) + 1.15
			}

			c[0] = Math.round(c[0] * colorChange)
			c[1] = Math.round(c[1] * colorChange)
			c[2] = Math.round(c[2] * colorChange)


			var cr = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";

			var obj = {
				r: c[0] / 255,
				g: c[1] / 255,
				b: c[2] / 255,
			}

			var textclr = getTextColor(obj);

			tabs.update(tabId, {
				backgroundColor: cr,
				foregroundColor: textclr,
			})

			if (tabId == tabs.getSelected()) {
				setColor(cr, textclr);
			}
			return;
		});
	}, {
		timeout: 1000
	});

}

//generated using http://harthur.github.io/brain/
var getTextColor = function (bgColor) {
	var output = runNetwork(bgColor);
	if (output.black > .5) {
		return 'black';
	}
	return 'white';
}

var runNetwork = function anonymous(input
	/**/
) {
	var net = {
		"layers": [{
			"r": {},
			"g": {},
			"b": {}
		}, {
			"0": {
				"bias": 14.176907520571566,
				"weights": {
					"r": -3.2764240497480652,
					"g": -16.90247884718719,
					"b": -2.9976364179397814
				}
			},
			"1": {
				"bias": 9.086071102351246,
				"weights": {
					"r": -4.327474143397604,
					"g": -15.780660155750773,
					"b": 2.879230202567851
				}
			},
			"2": {
				"bias": 22.274487339773476,
				"weights": {
					"r": -3.5830205067960965,
					"g": -25.498384261673618,
					"b": -6.998329189107962
				}
			}
		}, {
			"black": {
				"bias": 17.873962570788997,
				"weights": {
					"0": -15.542217788633987,
					"1": -13.377152708685674,
					"2": -24.52215186113144
				}
			}
		}],
		"outputLookup": true,
		"inputLookup": true
	};

	for (var i = 1; i < net.layers.length; i++) {
		var layer = net.layers[i];
		var output = {};

		for (var id in layer) {
			var node = layer[id];
			var sum = node.bias;

			for (var iid in node.weights) {
				sum += node.weights[iid] * input[iid];
			}
			output[id] = (1 / (1 + Math.exp(-sum)));
		}
		input = output;
	}
	return output;
}

function setColor(bg, fg) {
	$(".theme-background-color").css("background-color", bg);
	$(".theme-text-color").css("color", fg);
	if (fg == "white") {
		$(document.body).addClass("dark-theme");
	} else {
		$(document.body).removeClass("dark-theme");
	}
}
;//http://stackoverflow.com/a/5086688/4603285

jQuery.fn.insertAt = function (index, element) {
	var lastIndex = this.children().size()
	if (index < 0) {
		index = Math.max(0, lastIndex + 1 + index)
	}
	this.append(element)
	if (index < lastIndex) {
		this.children().eq(index).before(this.children().last())
	}
	return this;
}

var tabContainer = $(".tab-group");
var tabGroup = $(".tab-group #tabs"); //TODO these names are confusing

/* tab events */

var lastTabDeletion = 0;

tabGroup.on("mousewheel", ".tab-item", function (e) {

	if (e.originalEvent.deltaY > 65 && e.originalEvent.deltaX < 10 && Date.now() - lastTabDeletion > 650) { //swipe up to delete tabs

		lastTabDeletion = Date.now();

		/* tab deletion is disabled in focus mode */
		if (isFocusMode) {
			showFocusModeError();
			return;
		}

		var tab = $(this).attr("data-tab");

		//TODO this should be a css animation
		getTabElement(tab).animate({
			"margin-top": "-40px",
		}, 125, function () {

			if (tab == tabs.getSelected()) {
				var currentIndex = tabs.getIndex(tabs.getSelected());
				var nextTab = tabs.getAtIndex(currentIndex + 1) || tabs.getAtIndex(currentIndex - 1);

				destroyTab(tab);

				if (nextTab) {
					switchToTab(nextTab.id);
				} else {
					addTab();
				}

			} else {
				destroyTab(tab);
			}

		});
	}

	if (e.originalEvent.deltaY > 0) { //downward swipes should still be handled by expandedTabMode.js
		e.stopPropagation(); //prevent the event from bubbling up to expandedTabMode.js, where exitExpandedMode would be triggered
	}

});

//click to enter edit mode or switch to tab

tabGroup.on("click", ".tab-item", function (e) {
	var tabId = $(this).attr("data-tab");

	//if the tab isn't focused
	if (tabs.getSelected() != tabId) {
		switchToTab(tabId);
	} else if (!isExpandedMode) { //the tab is focused, edit tab instead
		enterEditMode(tabId);
	}

});

/* draws tabs and manages tab events */

function getTabElement(id) { //gets the DOM element for a tab
	return $('.tab-item[data-tab="{id}"]'.replace("{id}", id))
}

//gets the input for a tab element

$.fn.getInput = function () {
	return this.find(".tab-input");
}

function setActiveTabElement(tabId) {
	$(".tab-item.active").removeClass("active");

	var el = getTabElement(tabId);
	el.addClass("active");

	if (tabs.count() > 1) { //if there is only one tab, we don't need to indicate which one is selected
		el.addClass("has-highlight");
	} else {
		el.removeClass("has-highlight");
	}

	if (!isExpandedMode) {

		requestIdleCallback(function () {
			el[0].scrollIntoView({
				behavior: "smooth"
			});
		}, {
			timeout: 1000
		});

	}

}

function leaveTabEditMode(options) {
	$(".tab-item.selected").removeClass("selected");
	if (options && options.blur) {
		$(".tab-item .tab-input").blur();
	}
	tabGroup.removeClass("has-selected-tab");
	hidesearchbar();
}

function enterEditMode(tabId) {

	leaveExpandedMode();

	var tabEl = getTabElement(tabId);
	var webview = getWebview(tabId)[0];

	var currentURL = webview.getAttribute("src");

	if (currentURL == "about:blank") {
		currentURL = "";
	}

	var input = tabEl.getInput();

	tabEl.addClass("selected");
	input.val(currentURL);
	input.get(0).focus();
	input.select();
	showSearchbar(input);
	showSearchbarResults("", input, null);
	tabGroup.addClass("has-selected-tab");

	//show keyword suggestions in the searchbar

	try { //before first webview navigation, this will be undefined
		getWebview(tabs.getSelected())[0].send("getKeywordsData");
	} catch (e) {

	}
}

function rerenderTabElement(tabId) {
	var tabEl = getTabElement(tabId),
		tabData = tabs.get(tabId);

	var tabTitle = tabData.title || "New Tab";
	tabEl.find(".tab-view-contents .title").text(tabTitle).attr("title", tabTitle);

	var secIcon = tabEl[0].getElementsByClassName("icon-tab-not-secure");

	if (tabData.secure === false) {
		if (!secIcon[0]) {
			tabEl.find(".tab-view-contents").prepend("<i class='fa fa-exclamation-triangle icon-tab-not-secure' title='Your connection to this website is not secure.'></i>");
		}
	} else if (secIcon[0]) {
		secIcon[0].parentNode.removeChild(secIcon[0]);
	}

	//update the star to reflect whether the page is bookmarked or not
	bookmarks.renderStar(tabId, tabEl.find(".bookmarks-button"));
}

function createTabElement(tabId) {
	var data = tabs.get(tabId),
		url = urlParser.parse(data.url);

	var tab = $("<div class='tab-item'>");
	tab.attr("data-tab", tabId);

	if (data.private) {
		tab.addClass("private-tab");
	}

	var ec = $("<div class='tab-edit-contents'>");

	var input = $("<input class='tab-input mousetrap'>");
	input.attr("placeholder", "Search or enter address");
	input.attr("value", url);

	input.appendTo(ec);
	bookmarks.getStar(tabId).appendTo(ec);

	ec.appendTo(tab);

	var vc = $("<div class='tab-view-contents'>")
	readerView.getButton(tabId).appendTo(vc);

	if (data.private) {
		vc.prepend("<i class='fa fa-ban icon-tab-is-private'></i>").attr("title", "Private tab");
	}

	vc.append($("<span class='title'>").text(data.title || "New Tab"));

	vc.append("<span class='secondary-text'></span>");
	vc.appendTo(tab);



	/* events */

	input.on("keydown", function (e) {
		if (e.keyCode == 9 || e.keyCode == 40) { //if the tab or arrow down key was pressed
			focussearchbarItem();
			e.preventDefault();
		}
	});

	//keypress doesn't fire on delete key - use keyup instead
	input.on("keyup", function (e) {
		if (e.keyCode == 8) {
			showSearchbarResults($(this).val(), $(this), e);
		}
	});

	input.on("keypress", function (e) {

		if (e.keyCode == 13) { //return key pressed; update the url
			var tabId = $(this).parents(".tab-item").attr("data-tab");
			var newURL = parsesearchbarURL($(this).val());

			navigate(tabId, newURL);
			leaveTabEditMode(tabId);

			//focus the webview, so that autofocus inputs on the page work
			getWebview(tabs.getSelected())[0].focus();

		} else if (e.keyCode == 9) {
			return;
			//tab key, do nothing - in keydown listener
		} else if (e.keyCode == 16) {
			return;
			//shift key, do nothing
		} else if (e.keyCode == 8) {
			return;
			//delete key is handled in keyUp
		} else { //show the searchbar
			showSearchbarResults($(this).val(), $(this), e);
		}

		//on keydown, if the autocomplete result doesn't change, we move the selection instead of regenerating it to avoid race conditions with typing. Adapted from https://github.com/patrickburke/jquery.inlineComplete

		var v = String.fromCharCode(e.keyCode).toLowerCase();
		var sel = this.value.substring(this.selectionStart, this.selectionEnd).indexOf(v);

		if (v && sel == 0) {
			this.selectionStart += 1;
			didFireKeydownSelChange = true;
			return false;
		} else {
			didFireKeydownSelChange = false;
		}
	});

	//prevent clicking in the input from re-entering edit-tab mode

	input.on("click", function (e) {
		e.stopPropagation();
	});

	return tab;
}

function addTab(tabId, options) {

	/* options 
	
						options.focus - whether to enter editing mode when the tab is created. Defaults to true.
						options.openInBackground - whether to open the tab without switching to it. Defaults to false.
						options.leaveEditMode - whether to hide the searchbar when creating the tab
	
						*/

	options = options || {};

	if (options.leaveEditMode != false) {
		leaveTabEditMode(); //if a tab is in edit-mode, we want to exit it
	}

	tabId = tabId || tabs.add();

	var tab = tabs.get(tabId);

	//use the correct new tab colors

	if (tab.private && !tab.backgroundColor) {
		tabs.update(tabId, {
			backgroundColor: defaultColors.private[0],
			foregroundColor: defaultColors.private[1]
		});
	} else if (!tab.backgroundColor) {
		tabs.update(tabId, {
			backgroundColor: defaultColors.regular[0],
			foregroundColor: defaultColors.regular[1]
		});
	}

	var index = tabs.getIndex(tabId);
	tabGroup.insertAt(index, createTabElement(tabId));

	addWebview(tabId);

	//open in background - we don't want to enter edit mode or switch to tab

	if (options.openInBackground) {
		return;
	}

	switchToTab(tabId);

	if (options.focus != false) {
		enterEditMode(tabId)
	}
}

//startup state is created in sessionRestore.js

//when we click outside the navbar, we leave editing mode

bindWebviewEvent("focus", function () {
	leaveExpandedMode();
	leaveTabEditMode();
});
;/* provides simple utilities for entering/exiting expanded tab mode */

var tabDragArea = tabGroup[0]

require.async("dragula", function (dragula) {

	window.dragRegion = dragula();

	//reorder the tab state when a tab is dropped
	dragRegion.on("drop", function () {

		var tabOrder = [];

		tabContainer.find(".tab-item").each(function () {
			var tabId = parseInt($(this).attr("data-tab"));
			tabOrder.push(tabId);
		});

		tabs.reorder(tabOrder);
	});

});

tabContainer.on("mousewheel", function (e) {
	if (e.originalEvent.deltaY < -30 && e.originalEvent.deltaX < 10) { //swipe down to expand tabs
		enterExpandedMode();
		e.stopImmediatePropagation();
	} else if (e.originalEvent.deltaY > 70 && e.originalEvent.deltaX < 10) {
		leaveExpandedMode();
	}
});

tabContainer.on("mouseenter", ".tab-item", function (e) {
	if (isExpandedMode) {
		var item = $(this);
		setTimeout(function () {
			if (item.is(":hover")) {
				var tab = tabs.get(item.attr("data-tab"));

				switchToTab(item.attr("data-tab"));
			}
		}, 125);
	}
});

var isExpandedMode = false;

function enterExpandedMode() {
	if (!isExpandedMode) {

		dragRegion.containers = [tabDragArea]; //only allow dragging tabs in expanded mode

		leaveTabEditMode();

		//get the subtitles

		tabs.get().forEach(function (tab) {
			try {
				var prettyURL = urlParser.prettyURL(tab.url);
			} catch (e) {
				var prettyURL = "";
			}

			var tabEl = getTabElement(tab.id);

			tabEl.find(".secondary-text").text(prettyURL);
		});

		$(document.body).addClass("is-expanded-mode");
		getWebview(tabs.getSelected()).blur();
		tabContainer.get(0).focus();

		isExpandedMode = true;
	}
}

function leaveExpandedMode() {
	if (isExpandedMode) {
		dragRegion.containers = [];
		$(document.body).removeClass("is-expanded-mode");

		isExpandedMode = false;
	}
}

//when a tab is clicked, we want to minimize the tabstrip

tabContainer.on("click", ".tab-item", function () {
	if (isExpandedMode) {
		leaveExpandedMode();
		getWebview(tabs.getSelected())[0].focus();
	}
});
;var addTabButton = $(".add-tab");

addTabButton.on("click", function (e) {
	var newTab = tabs.add({}, tabs.getIndex(tabs.getSelected()) + 1);
	addTab(newTab);
});
;/* defines keybindings that aren't in the menu (so they aren't defined by menu.js). For items in the menu, also handles ipc messages */

ipc.on("zoomIn", function () {
	getWebview(tabs.getSelected())[0].send("zoomIn");
});

ipc.on("zoomOut", function () {
	getWebview(tabs.getSelected())[0].send("zoomOut");
});

ipc.on("zoomReset", function () {
	getWebview(tabs.getSelected())[0].send("zoomReset");
});

ipc.on("print", function () {
	getWebview(tabs.getSelected())[0].print();
})

ipc.on("inspectPage", function () {
	getWebview(tabs.getSelected())[0].openDevTools();
});

ipc.on("addTab", function (e) {

	/* new tabs can't be created in focus mode */
	if (isFocusMode) {
		showFocusModeError();
		return;
	}

	var newIndex = tabs.getIndex(tabs.getSelected()) + 1;
	var newTab = tabs.add({}, newIndex);
	addTab(newTab);
});

function addPrivateTab() {


	/* new tabs can't be created in focus mode */
	if (isFocusMode) {
		showFocusModeError();
		return;
	}


	if (tabs.count() == 1 && tabs.getAtIndex(0).url == "about:blank") {
		destroyTab(tabs.getAtIndex(0).id);
	}

	var newIndex = tabs.getIndex(tabs.getSelected()) + 1;

	var privateTab = tabs.add({
		url: "about:blank",
		private: true,
	}, newIndex)
	addTab(privateTab);
}

ipc.on("addPrivateTab", addPrivateTab);

require.async("mousetrap", function (Mousetrap) {
	window.Mousetrap = Mousetrap;

	Mousetrap.bind("shift+command+p", addPrivateTab);

	Mousetrap.bind(["command+l", "command+k"], function (e) {
		enterEditMode(tabs.getSelected());
		return false;
	})

	Mousetrap.bind("command+w", function (e) {

		//prevent command+w from closing the window
		e.preventDefault();
		e.stopImmediatePropagation();


		/* disabled in focus mode */
		if (isFocusMode) {
			showFocusModeError();
			return;
		}

		var currentTab = tabs.getSelected();
		var currentIndex = tabs.getIndex(currentTab);
		var nextTab = tabs.getAtIndex(currentIndex + 1) || tabs.getAtIndex(currentIndex - 1);

		destroyTab(currentTab);
		if (nextTab) {
			switchToTab(nextTab.id);
		} else {
			addTab();
		}

		if (tabs.count() == 1) { //there isn't any point in being in expanded mode any longer
			leaveExpandedMode();
		}

		return false;
	});

	Mousetrap.bind("command+d", function (e) {
		//TODO need an actual api for this that updates the star and bookmarks

		getTabElement(tabs.getSelected()).find(".bookmarks-button").click();
	})

	Mousetrap.bind("command+f", function (e) {
		findinpage.toggle();
	});

	// cmd+x should switch to tab x. Cmd+9 should switch to the last tab

	for (var i = 1; i < 9; i++) {
		(function (i) {
			Mousetrap.bind("command+" + i, function (e) {
				var currentIndex = tabs.getIndex(tabs.getSelected());
				var newTab = tabs.getAtIndex(currentIndex + i) || tabs.getAtIndex(currentIndex - i);
				if (newTab) {
					switchToTab(newTab.id);
				}
			})

			Mousetrap.bind("shift+command+" + i, function (e) {
				var currentIndex = tabs.getIndex(tabs.getSelected());
				var newTab = tabs.getAtIndex(currentIndex - i) || tabs.getAtIndex(currentIndex + i);
				if (newTab) {
					switchToTab(newTab.id);
				}
			})

		})(i);
	}

	Mousetrap.bind("command+9", function (e) {
		switchToTab(tabs.getAtIndex(tabs.count() - 1).id);
	})

	Mousetrap.bind("shift+command+9", function (e) {
		switchToTab(tabs.getAtIndex(0).id);
	})

	Mousetrap.bind("esc", function (e) {
		leaveTabEditMode();
		leaveExpandedMode();
		getWebview(tabs.getSelected()).get(0).focus();
	});

	Mousetrap.bind("shift+command+r", function () {
		getTabElement(tabs.getSelected()).find(".reader-button").trigger("click");
	});

	//TODO add help docs for this

	Mousetrap.bind("command+left", function (d) {
		getWebview(tabs.getSelected())[0].goBack();
	});

	Mousetrap.bind("command+right", function (d) {
		getWebview(tabs.getSelected())[0].goForward();
	});

	Mousetrap.bind(["option+command+left", "shift+ctrl+tab"], function (d) {

		enterExpandedMode(); //show the detailed tab switcher

		var currentIndex = tabs.getIndex(tabs.getSelected());
		var previousTab = tabs.getAtIndex(currentIndex - 1);

		if (previousTab) {
			switchToTab(previousTab.id);
		} else {
			switchToTab(tabs.getAtIndex(tabs.count() - 1).id);
		}
	});

	Mousetrap.bind(["option+command+right", "ctrl+tab"], function (d) {

		enterExpandedMode();

		var currentIndex = tabs.getIndex(tabs.getSelected());
		var nextTab = tabs.getAtIndex(currentIndex + 1);

		if (nextTab) {
			switchToTab(nextTab.id);
		} else {
			switchToTab(tabs.getAtIndex(0).id);
		}
	});

	Mousetrap.bind("command+n", function (d) { //destroys all current tabs, and creates a new, empty tab. Kind of like creating a new window, except the old window disappears.

		var tset = tabs.get();
		for (var i = 0; i < tset.length; i++) {
			destroyTab(tset[i].id);
		}

		addTab(); //create a new, blank tab
	});

	//return exits expanded mode

	Mousetrap.bind("return", function () {
		if (isExpandedMode) {
			leaveExpandedMode();
			getWebview(tabs.getSelected())[0].focus();
		}
	});

	Mousetrap.bind("shift+command+e", function () {
		if (!isExpandedMode) {
			enterExpandedMode();
		} else {
			leaveExpandedMode();
		}
	});

	Mousetrap.bind("shift+command+b", function () {
		clearsearchbar();
		showSearchbar(getTabElement(tabs.getSelected()).getInput());
		enterEditMode(tabs.getSelected());
		showAllBookmarks();
	});

}); //end require mousetrap

$(document.body).on("keyup", function (e) {
	if (e.keyCode == 17) { //ctrl key
		leaveExpandedMode();
	}
});
;/* handles viewing pdf files using pdf.js. Recieves events from main.js will-download */

var PDFViewerURL = "file://" + __dirname + "/pdfjs/web/viewer.html?url=";

ipc.on("openPDF", function (event, filedata) {
	console.log("opening PDF", filedata);

	var PDFurl = PDFViewerURL + filedata.url,
		hasOpenedPDF = false;

	// we don't know which tab the event came from, so we loop through each tab to find out.

	tabs.get().forEach(function (tab) {
		if (tab.url == filedata.url) {
			navigate(tab.id, PDFurl);
			hasOpenedPDF = true;
		}
	});

	if (!hasOpenedPDF) {
		var newTab = tabs.add({
			url: PDFurl
		}, tabs.getIndex(tabs.getSelected()) + 1);

		addTab(newTab, {
			focus: false
		});
	}
});
;var findinpage = {
	container: $("#findinpage-bar"),
	input: $("#findinpage-bar .findinpage-input"),
	isEnabled: false,
	start: function (options) {
		findinpage.container.prop("hidden", false);
		findinpage.isEnabled = true;
		findinpage.input.focus().select();
	},
	end: function (options) {
		findinpage.container.prop("hidden", true);
		if (options && options.blurInput != false) {
			findinpage.input.blur();
		}
		findinpage.isEnabled = false;

		//focus the webview

		if (findinpage.input.is(":focus")) {
			getWebview(tabs.getSelected()).get(0).focus();
		}
	},
	toggle: function () {
		if (findinpage.isEnabled) {
			findinpage.end();
		} else {
			findinpage.start();
		}
	},
	escape: function (text) { //removes apostrophes from text so we can safely embed it in a string
		return text.replace(/'/g, "\\'");
	}
}

findinpage.input.on("keyup", function (e) {
	//escape key should exit find mode, not continue searching
	if (e.keyCode == 27) {
		findinpage.end();
		return;
	}
	var text = findinpage.escape($(this).val());
	var webview = getWebview(tabs.getSelected())[0];

	//this stays on the current text if it still matches, preventing flickering. However, if the return key was pressed, we should move on to the next match instead, so this shouldn't run.
	if (e.keyCode != 13) {
		webview.executeJavaScript("window.getSelection().empty()");
	}

	webview.executeJavaScript("find('{t}', false, false, true, false, false, false)".replace("{t}", text)); //see https://developer.mozilla.org/en-US/docs/Web/API/Window/find for a description of the parameters
});

findinpage.input.on("blur", function (e) {
	findinpage.end({
			blurInput: false
		}) //if end tries to blur it again, we'll get stuck in an infinite loop with the event handler
});
;var sessionRestore = {
	save: function () {
		requestIdleCallback(function () {
			var data = {
				version: 1,
				tabs: [],
				selected: tabs._state.selected,
			}

			//save all tabs that aren't private

			tabs.get().forEach(function (tab) {
				if (!tab.private) {
					data.tabs.push(tab);
				}
			});

			localStorage.setItem("sessionrestoredata", JSON.stringify(data));
		}, {
			timeout: 2250
		});
	},
	restore: function () {
		//get the data

		try {
			var data = JSON.parse(localStorage.getItem("sessionrestoredata") || "{}");

			localStorage.setItem("sessionrestoredata", "{}");

			if (data.version && data.version != 1) { //if the version isn't compatible, we don't want to restore.
				addTab({
					leaveEditMode: false //we know we aren't in edit mode yet, so we don't have to leave it
				});
				return;
			}

			console.info("restoring tabs", data.tabs);

			if (!data || !data.tabs || !data.tabs.length || (data.tabs.length == 1 && data.tabs[0].url == "about:blank")) { //If there are no tabs, or if we only have one tab, and it's about:blank, don't restore
				addTab(tabs.add(), {
					leaveEditMode: false
				});
				return;
			}

			//actually restore the tabs
			data.tabs.forEach(function (tab, index) {
				var newTab = tabs.add(tab);
				addTab(newTab, {
					openInBackground: true,
					leaveEditMode: false,
				});

			});

			//set the selected tab

			if (tabs.get(data.selected)) { //if the selected tab was a private tab that we didn't restore, it's possible that the selected tab doesn't actually exist. This will throw an error, so we want to make sure the tab exists before we try to switch to it
				switchToTab(data.selected);
			} else { //switch to the first tab
				switchToTab(data.tabs[0].id);
			}

		} catch (e) {
			//if we can't restore the session, try to start over with a blank tab
			console.warn("failed to restore session, rolling back");
			console.error(e);

			localStorage.setItem("sessionrestoredata", "{}");

			$("webview, .tab-item").remove();
			addTab();

		}
	}
}

//TODO make this a preference

sessionRestore.restore();

setInterval(sessionRestore.save, 12500);
;var isFocusMode = false;

ipc.on("enterFocusMode", function () {
	isFocusMode = true;
	$(document.body).addClass("is-focus-mode");

	setTimeout(function () { //wait to show the message until the tabs have been hidden, to make the message less confusing
		electron.remote.require("dialog").showMessageBox({
			type: "info",
			buttons: ["OK"],
			message: "You're in focus mode.",
			detail: 'In focus mode, all tabs except the current one are hidden, and you can\'t create new tabs. You can leave focus mode by unchecking "focus mode" from the view menu.'
		});
	}, 16);

});

ipc.on("exitFocusMode", function () {
	isFocusMode = false;
	$(document.body).removeClass("is-focus-mode");
});

function showFocusModeError() {
	electron.remote.require("dialog").showMessageBox({
		type: "info",
		buttons: ["OK"],
		message: "You're in focus mode.",
		detail: 'You can leave focus mode by unchecking "focus mode" in the view menu.'
	});
}
