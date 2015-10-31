/* defines keybindings that aren't in the menu (so they aren't defined by menu.js). For items in the menu, also handles ipc messages */

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
	addTab();
});

ipc.on("addPrivateTab", function (e) {
	var privateTab = tabs.add({
		url: "about:blank",
		private: true,
	})
	addTab(privateTab);
});

var Mousetrap = require("mousetrap");

Mousetrap.bind("command+l", function (e) {
	enterEditMode(tabs.getSelected());
	return false;
})

Mousetrap.bind("command+w", function (e) {
	e.preventDefault();
	e.stopImmediatePropagation();
	e.stopPropagation();
	destroyTab(tabs.getSelected());
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

for (var i = 0; i < 9; i++) {
	(function (i) {
		Mousetrap.bind("command+" + i, function (e) {
			var newTab = tabs.getAtIndex(i - 1);
			if (!newTab) { //we're trying to switch to a tab that doesn't exist
				return;
			}
			switchToTab(newTab.id);
		})
	})(i);
}

Mousetrap.bind("command+9", function (e) {
	switchToTab(tabs.getAtIndex(tabs.count() - 1).id);
})
