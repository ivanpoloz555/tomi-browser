/* defines keybindings that aren't in the menu (so they aren't defined by menu.js). For items in the menu, also handles ipc messages */

ipc.on('zoomIn', function () {
  getWebview(tabs.getSelected()).send('zoomIn')
})

ipc.on('zoomOut', function () {
  getWebview(tabs.getSelected()).send('zoomOut')
})

ipc.on('zoomReset', function () {
  getWebview(tabs.getSelected()).send('zoomReset')
})

ipc.on('print', function () {
  getWebview(tabs.getSelected()).print()
})

ipc.on('findInPage', function () {
  findinpage.start()
})

ipc.on('inspectPage', function () {
  getWebview(tabs.getSelected()).openDevTools()
})

ipc.on('showReadingList', function () {
  readerView.showReadingList()
})

ipc.on('addTab', function (e, data) {
  /* new tabs can't be created in focus mode */
  if (isFocusMode) {
    showFocusModeError()
    return
  }

  var newIndex = tabs.getIndex(tabs.getSelected()) + 1
  var newTab = tabs.add({
    url: data.url || ''
  }, newIndex)

  addTab(newTab, {
    enterEditMode: !data.url // only enter edit mode if the new tab is about:blank
  })
})

ipc.on('saveCurrentPage', function () {
  var currentTab = tabs.get(tabs.getSelected())

  // new tabs cannot be saved
  if (!currentTab.url) {
    return
  }

  var savePath = remote.dialog.showSaveDialog(remote.getCurrentWindow(), {})

  // savePath will be undefined if the save dialog is canceled
  if (savePath) {
    if (!savePath.endsWith('.html')) {
      savePath = savePath + '.html'
    }
    getWebview(currentTab.id).getWebContents().savePage(savePath, 'HTMLComplete', function () { })
  }
})

function addPrivateTab () {
  /* new tabs can't be created in focus mode */
  if (isFocusMode) {
    showFocusModeError()
    return
  }

  if (isEmpty(tabs.get())) {
    destroyTab(tabs.getAtIndex(0).id)
  }

  var newIndex = tabs.getIndex(tabs.getSelected()) + 1

  var privateTab = tabs.add({
    url: 'about:blank',
    private: true
  }, newIndex)
  addTab(privateTab)
}

ipc.on('addPrivateTab', addPrivateTab)

ipc.on('addTask', function () {
  /* new tasks can't be created in focus mode */
  if (isFocusMode) {
    showFocusModeError()
    return
  }

  addTaskFromOverlay()
  taskOverlay.show()
  setTimeout(function () {
    taskOverlay.hide()
    enterEditMode(tabs.getSelected())
  }, 600)
})

ipc.on('goBack', function () {
  try {
    getWebview(tabs.getSelected()).goBack()
  } catch (e) { }
})

ipc.on('goForward', function () {
  try {
    getWebview(tabs.getSelected()).goForward()
  } catch (e) { }
})

function defineShortcut (keyMapName, fn) {
  Mousetrap.bind(keyMap[keyMapName], function (e, combo) {
    // mod+left and mod+right are also text editing shortcuts, so they should not run when an input field is focused
    if (combo === 'mod+left' || combo === 'mod+right') {
      getWebview(tabs.getSelected()).executeJavaScript('document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA"', function (isInputFocused) {
        if (isInputFocused === false) {
          fn(e, combo)
        }
      })
    } else {
      // other shortcuts can run immediately
      fn(e, combo)
    }
  })
}

settings.get('keyMap', function (keyMapSettings) {
  keyMap = userKeyMap(keyMapSettings)

  var Mousetrap = require('mousetrap')

  window.Mousetrap = Mousetrap
  defineShortcut('addPrivateTab', addPrivateTab)

  defineShortcut('enterEditMode', function (e) {
    enterEditMode(tabs.getSelected())
    return false
  })

  defineShortcut('closeTab', function (e) {
    // prevent mod+w from closing the window
    e.preventDefault()
    e.stopImmediatePropagation()

    closeTab(tabs.getSelected())

    return false
  })

  defineShortcut('addToFavorites', function (e) {
    bookmarks.handleStarClick(getTabElement(tabs.getSelected()).querySelector('.bookmarks-button'))
    enterEditMode(tabs.getSelected()) // we need to show the bookmarks button, which is only visible in edit mode
  })

  // cmd+x should switch to tab x. Cmd+9 should switch to the last tab

  for (var i = 1; i < 9; i++) {
    (function (i) {
      Mousetrap.bind('mod+' + i, function (e) {
        var currentIndex = tabs.getIndex(tabs.getSelected())
        var newTab = tabs.getAtIndex(currentIndex + i) || tabs.getAtIndex(currentIndex - i)
        if (newTab) {
          switchToTab(newTab.id)
        }
      })

      Mousetrap.bind('shift+mod+' + i, function (e) {
        var currentIndex = tabs.getIndex(tabs.getSelected())
        var newTab = tabs.getAtIndex(currentIndex - i) || tabs.getAtIndex(currentIndex + i)
        if (newTab) {
          switchToTab(newTab.id)
        }
      })
    })(i)
  }

  defineShortcut('gotoLastTab', function (e) {
    switchToTab(tabs.getAtIndex(tabs.count() - 1).id)
  })

  defineShortcut('gotoFirstTab', function (e) {
    switchToTab(tabs.getAtIndex(0).id)
  })

  Mousetrap.bind('esc', function (e) {
    taskOverlay.hide()
    leaveTabEditMode()

    getWebview(tabs.getSelected()).focus()
  })

  defineShortcut('toggleReaderView', function () {
    var tab = tabs.get(tabs.getSelected())

    if (tab.isReaderView) {
      readerView.exit(tab.id)
    } else {
      readerView.enter(tab.id)
    }
  })

  // TODO add help docs for this

  defineShortcut('goBack', function (d) {
    getWebview(tabs.getSelected()).goBack()
  })

  defineShortcut('goForward', function (d) {
    getWebview(tabs.getSelected()).goForward()
  })

  defineShortcut('switchToPreviousTab', function (d) {
    var currentIndex = tabs.getIndex(tabs.getSelected())
    var previousTab = tabs.getAtIndex(currentIndex - 1)

    if (previousTab) {
      switchToTab(previousTab.id)
    } else {
      switchToTab(tabs.getAtIndex(tabs.count() - 1).id)
    }
  })

  defineShortcut('switchToNextTab', function (d) {
    var currentIndex = tabs.getIndex(tabs.getSelected())
    var nextTab = tabs.getAtIndex(currentIndex + 1)

    if (nextTab) {
      switchToTab(nextTab.id)
    } else {
      switchToTab(tabs.getAtIndex(0).id)
    }
  })

  defineShortcut('closeAllTabs', function (d) { // destroys all current tabs, and creates a new, empty tab. Kind of like creating a new window, except the old window disappears.
    var tset = tabs.get()
    for (var i = 0; i < tset.length; i++) {
      destroyTab(tset[i].id)
    }

    addTab() // create a new, blank tab
  })

  defineShortcut('toggleTasks', function () {
    if (taskOverlay.isShown) {
      taskOverlay.hide()
    } else {
      taskOverlay.show()
    }
  })

  var lastReload = 0

  defineShortcut('reload', function () {
    var time = Date.now()

    // pressing mod+r twice in a row reloads the whole browser
    if (time - lastReload < 500) {
      window.location.reload()
    } else {
      var w = getWebview(tabs.getSelected())

      if (w.src) { // webview methods aren't available if the webview is blank
        w.reloadIgnoringCache()
      }
    }

    lastReload = time
  })

  // mod+enter navigates to searchbar URL + ".com"
  defineShortcut('completeSearchbar', function () {
    if (currentSearchbarInput) { // if the searchbar is open
      var value = currentSearchbarInput.value

      leaveTabEditMode()

      // if the text is already a URL, navigate to that page
      if (urlParser.isURLMissingProtocol(value)) {
        navigate(tabs.getSelected(), value)
      } else {
        navigate(tabs.getSelected(), urlParser.parse(value + '.com'))
      }
    }
  })

  defineShortcut('showAndHideMenuBar', function () {
    toggleMenuBar()
  })
}) // end settings.get

// reload the webview when the F5 key is pressed
document.body.addEventListener('keydown', function (e) {
  if (e.keyCode === 116) {
    try {
      getWebview(tabs.getSelected()).reloadIgnoringCache()
    } catch (e) { }
  }
})
