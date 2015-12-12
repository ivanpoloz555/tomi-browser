/* common to webview, tabrenderer, etc */

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


//options:
//switchToTab: whether to switch to another tab, or create a new one if there are no tabs left. Defaults to true

function destroyTab(id, options) {
	options = options || {};
	//focus the next tab, or the previous tab if this was the last tab

	if (options.switchToTab) {
		var t = tabs.getIndex(id);
		var nextTab = tabs.getAtIndex(t + 1) || tabs.getAtIndex(t - 1);
	}

	$(".tab-item[data-tab={id}]".replace("{id}", id)).remove(); //remove the actual tab element
	var t = tabs.destroy(id); //remove from state - returns the index of the destroyed tab
	destroyWebview(id); //remove the webview

	//if there are no other tabs, create a new one
	if (options.switchToTab && !nextTab) {
		return addTab();
	} else if (options.switchToTab) {
		switchToTab(nextTab.id);
	}
}

/* switches to a tab - update the webview, state, tabstrip, etc. */

function switchToTab(id) {

	leaveTabEditMode();
	setActiveTabElement(id);

	switchToWebview(id);

	tabs.setSelected(id);

	var tabData = tabs.get(id);
	setColor(tabData.backgroundColor, tabData.foregroundColor);

	//we only want to mark the tab as active if someone actually interacts with it. If it is clicked on and then quickly clicked away from, it should still be marked as inactive

	setTimeout(function () {
		if (tabs.getSelected() == id) {
			tabs.update(id, {
				lastActivity: Date.now(),
			});
			tabActivity.refresh();
		}
	}, 2500);

}
