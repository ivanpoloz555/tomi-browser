const previewCache = require('previewCache.js')
var getView = remote.getGlobal('getView')
var urlParser = require('util/urlParser.js')
var settings = require('util/settings/settings.js')

/* implements selecting webviews, switching between them, and creating new ones. */

var placeholderImg = document.getElementById('webview-placeholder')

var windowIsMaximized = false // affects navbar height on Windows

function lazyRemoteObject (getObject) {
  var cachedItem = null
  return new Proxy({}, {
    get: function (obj, prop) {
      if (!cachedItem) {
        cachedItem = getObject()
      }
      return cachedItem[prop]
    },
    set: function (obj, prop, value) {
      if (!cachedItem) {
        cachedItem = getObject()
      }
      cachedItem[prop] = value
    }
  })
}

function forceUpdateDragRegions () {
  setTimeout(function () {
    // manually force the drag regions to update to work around https://github.com/electron/electron/issues/14038
    var d = document.createElement('div')
    d.setAttribute('style', '-webkit-app-region:drag; width: 1px; height: 1px;')
    document.body.appendChild(d)
    setTimeout(function () {
      document.body.removeChild(d)
    }, 100)
  }, 100)
}

function captureCurrentTab (options) {
  if (tabs.get(tabs.getSelected()).private) {
    // don't capture placeholders for private tabs
    return
  }

  if (webviews.placeholderRequests.length > 0 && !(options && options.forceCapture === true)) {
    // capturePage doesn't work while the view is hidden
    return
  }

  ipc.send('getCapture', {
    id: webviews.selectedId,
    width: Math.round(window.innerWidth / 10),
    height: Math.round(window.innerHeight / 10)
  })
}

// called whenever a new page starts loading, or an in-page navigation occurs
function onPageURLChange (tab, url) {
  if (url.indexOf('https://') === 0 || url.indexOf('about:') === 0 || url.indexOf('chrome:') === 0 || url.indexOf('file://') === 0) {
    tabs.update(tab, {
      secure: true,
      url: url
    })
  } else {
    tabs.update(tab, {
      secure: false,
      url: url
    })
  }
}

// called whenever the page finishes loading
function onPageLoad (webview, tabId, e) {
  webviews.callAsync(tabId, 'getURL', null, function (err, url) {
    if (err) {
      return
    }
    // capture a preview image if a new page has been loaded
    if (tabId === tabs.getSelected() && tabs.get(tabId).url !== url) {
      setTimeout(function () {
        // sometimes the page isn't visible until a short time after the did-finish-load event occurs
        captureCurrentTab()
      }, 100)
    }

    onPageURLChange(tabId, url)
  })
}

// called whenever a navigation finishes
function onNavigate (webview, tabId, e, url, httpResponseCode, httpStatusText) {
  onPageURLChange(tabId, url)
}

const webviews = {
  tabViewMap: {}, // tabId: browserView
  tabContentsMap: {}, // tabId: webContents
  viewFullscreenMap: {}, // tabId, isFullscreen
  selectedId: null,
  placeholderRequests: [],
  asyncCallbacks: {},
  internalPages: {
    error: urlParser.getFileURL(__dirname + '/pages/error/index.html')
  },
  events: [],
  nextEventID: 0,
  IPCEvents: [],
  bindEvent: function (event, fn, options) {
    webviews.nextEventID++
    webviews.events.push({
      event: event,
      fn: fn,
      options: options,
      id: webviews.nextEventID
    })
  },
  unbindEvent: function (event, fn) {
    for (var i = 0; i < webviews.events.length; i++) {
      if (webviews.events[i].event === event && webviews.events[i].fn === fn) {
        webviews.events.splice(i, 1)
        i--
      }
    }
  },
  bindIPC: function (name, fn) {
    webviews.IPCEvents.push({
      name: name,
      fn: fn
    })
  },
  viewMargins: [0, 0, 0, 0], // top, right, bottom, left
  adjustMargin: function (margins) {
    for (var i = 0; i < margins.length; i++) {
      webviews.viewMargins[i] += margins[i]
    }
    webviews.resize()
  },
  getViewBounds: function () {
    if (webviews.viewFullscreenMap[webviews.selectedId]) {
      return {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      }
    } else {
      if (window.platformType === 'windows' && !windowIsMaximized) {
        var navbarHeight = 46
      } else {
        var navbarHeight = 36
      }

      const viewMargins = webviews.viewMargins
      return {
        x: 0 + viewMargins[3],
        y: 0 + viewMargins[0] + navbarHeight,
        width: window.innerWidth - (viewMargins[1] + viewMargins[3]),
        height: window.innerHeight - (viewMargins[0] + viewMargins[2]) - navbarHeight
      }
    }
  },
  add: function (tabId) {
    var tabData = tabs.get(tabId)

    // if the tab is private, we want to partition it. See http://electron.atom.io/docs/v0.34.0/api/web-view-tag/#partition
    // since tab IDs are unique, we can use them as partition names
    if (tabData.private === true) {
      var partition = tabId.toString() // options.tabId is a number, which remote.session.fromPartition won't accept. It must be converted to a string first
    }

    ipc.send('createView', {
      id: tabId,
      webPreferencesString: JSON.stringify({
        webPreferences: {
          nodeIntegration: false,
          nodeIntegrationInSubFrames: true,
          scrollBounce: true,
          safeDialogs: true,
          safeDialogsMessage: 'Prevent this page from creating additional dialogs',
          preload: __dirname + '/dist/preload.js',
          contextIsolation: true,
          sandbox: true,
          enableRemoteModule: false,
          allowPopups: false,
          partition: partition
        }
      }),
      boundsString: JSON.stringify(webviews.getViewBounds()),
      // callbacks can't be sent over IPC, so they need to be removed
      events: webviews.events.map(function (e) {
        return {
          event: e.event,
          id: e.id,
          options: e.options
        }
      })
    })

    let view = lazyRemoteObject(function () {
      return getView(tabId)
    })

    let contents = lazyRemoteObject(function () {
      return getView(tabId).webContents
    })

    if (tabData.url) {
      ipc.send('loadURLInView', {id: tabData.id, url: urlParser.parse(tabData.url)})
    } else if (tabData.private) {
      // workaround for https://github.com/minbrowser/min/issues/872
      ipc.send('loadURLInView', {id: tabData.id, url: urlParser.parse('min://newtab')})
    }

    webviews.tabViewMap[tabId] = view
    webviews.tabContentsMap[tabId] = contents
    return view
  },
  setSelected: function (id, options) { // options.focus - whether to focus the view. Defaults to true.
    webviews.selectedId = id

    // create the view if it doesn't already exist
    if (!webviews.getView(id)) {
      webviews.add(id)
    }

    if (webviews.placeholderRequests.length > 0) {
      // update the placeholder instead of showing the actual view
      webviews.requestPlaceholder()
      return
    }

    ipc.send('setView', {
      id: id,
      bounds: webviews.getViewBounds(),
      focus: !options || options.focus !== false
    })

    forceUpdateDragRegions()
  },
  update: function (id, url) {
    ipc.send('loadURLInView', {id: id, url: urlParser.parse(url)})
  },
  destroy: function (id) {
    var w = webviews.tabViewMap[id]
    if (w) {
      ipc.send('destroyView', id)
    }
    delete webviews.tabViewMap[id]
    delete webviews.tabContentsMap[id]
    delete webviews.viewFullscreenMap[id]
    if (webviews.selectedId === id) {
      webviews.selectedId = null
    }
  },
  getView: function (id) {
    return webviews.tabViewMap[id]
  },
  get: function (id) {
    return webviews.tabContentsMap[id]
  },
  requestPlaceholder: function (reason) {
    if (reason && !webviews.placeholderRequests.includes(reason)) {
      webviews.placeholderRequests.push(reason)
    }
    if (webviews.placeholderRequests.length >= 1) {
      // create a new placeholder

      var img = previewCache.get(webviews.selectedId)
      var associatedTab = tabs.get(webviews.selectedId)
      if (img) {
        placeholderImg.src = img
        placeholderImg.hidden = false
      } else if (associatedTab && associatedTab.url) {
        captureCurrentTab({forceCapture: true})
      } else {
        placeholderImg.hidden = true
      }
    }
    setTimeout(function () {
      // wait to make sure the image is visible before the view is hidden
      // make sure the placeholder was not removed between when the timeout was created and when it occurs
      if (webviews.placeholderRequests.length > 0) {
        ipc.send('hideCurrentView')
      }
    }, 0)
  },
  hidePlaceholder: function (reason) {
    if (webviews.placeholderRequests.includes(reason)) {
      webviews.placeholderRequests.splice(webviews.placeholderRequests.indexOf(reason), 1)
    }

    if (webviews.placeholderRequests.length === 0) {
      // multiple things can request a placeholder at the same time, but we should only show the view again if nothing requires a placeholder anymore
      if (webviews.tabViewMap[webviews.selectedId]) {
        ipc.send('setView', {
          id: webviews.selectedId,
          bounds: webviews.getViewBounds(),
          focus: true
        })
        forceUpdateDragRegions()
      }
      // wait for the view to be visible before removing the placeholder
      setTimeout(function () {
        if (webviews.placeholderRequests.length === 0) { // make sure the placeholder hasn't been re-enabled
          placeholderImg.hidden = true
        }
      }, 400)
    }
  },
  getTabFromContents: function (contents) {
    for (let tabId in webviews.tabContentsMap) {
      if (webviews.tabContentsMap[tabId] === contents) {
        return tabId
      }
    }
    return null
  },
  releaseFocus: function () {
    ipc.send('focusMainWebContents')
  },
  focus: function () {
    if (webviews.selectedId) {
      ipc.send('focusView', webviews.selectedId)
    }
  },
  resize: function () {
    ipc.send('setBounds', {id: webviews.selectedId, bounds: webviews.getViewBounds()})
  },
  goBackIgnoringRedirects: function (id) {
    // special case: the current page is an internal page representing a regular webpage, and the previous page in history is that page (which likely means a redirect happened from the original page to the internal page)
    // probably either an error page (after  a redirect from the original page) or reader view
    var url = tabs.get(id).url

    var isInternalURL = urlParser.isInternalURL(url)
    if (isInternalURL) {
      var representedURL = urlParser.getSourceURL(url)
      // TODO this uses internal Electron API's - figure out a way to do this with the public API
      var history = webviews.get(id).history.slice(0, webviews.get(id).currentIndex + 1)
    }

    if (isInternalURL && history.length > 2 && history[history.length - 2] === representedURL) {
      webviews.get(id).goToOffset(-2)
    } else {
      webviews.get(id).goBack()
    }
  },
  callAsync: function (id, method, args, callback) {
    if (!(args instanceof Array)) {
      args = [args]
    }
    if (callback) {
      var callId = Math.random()
      webviews.asyncCallbacks[callId] = callback
    }
    ipc.send('callViewMethod', {id: id, callId: callId, method: method, args: args})
  }
}

window.addEventListener('resize', throttle(function () {
  if (webviews.placeholderRequests.length > 0) {
    // can't set view bounds if the view is hidden
    return
  }
  webviews.resize()
}, 75))

//leave HTML fullscreen when leaving window fullscreen
ipc.on('leave-full-screen', function () {
  // electron normally does this automatically (https://github.com/electron/electron/pull/13090/files), but it doesn't work for BrowserViews
  for (var view in webviews.viewFullscreenMap) {
    if (webviews.viewFullscreenMap[view]) {
      webviews.callAsync(view, 'executeJavaScript', 'document.exitFullscreen()')
    }
  }
})

webviews.bindEvent('enter-html-full-screen', function () {
  webviews.viewFullscreenMap[webviews.getTabFromContents(this)] = true
  webviews.resize()
})

webviews.bindEvent('leave-html-full-screen', function () {
  webviews.viewFullscreenMap[webviews.getTabFromContents(this)] = false
  webviews.resize()
})

ipc.on('maximize', function () {
  windowIsMaximized = true
  webviews.resize()
})

ipc.on('unmaximize', function () {
  windowIsMaximized = false
  webviews.resize()
})

webviews.bindEvent('did-finish-load', onPageLoad)
webviews.bindEvent('did-navigate-in-page', onPageLoad)
webviews.bindEvent('did-navigate', onNavigate)

webviews.bindEvent('page-title-updated', function (webview, tabId, e, title, explicitSet) {
  tabs.update(tabId, {
    title: title
  })
})

webviews.bindEvent('did-fail-load', function (webview, tabId, e, errorCode, errorDesc, validatedURL, isMainFrame) {
  if (errorCode && errorCode !== -3 && isMainFrame && validatedURL) {
    webviews.update(tabId, webviews.internalPages.error + '?ec=' + encodeURIComponent(errorCode) + '&url=' + encodeURIComponent(validatedURL))
  }
})

webviews.bindEvent('crashed', function (webview, tabId, e, isKilled) {
  var url = tabs.get(tabId).url

  tabs.update(tabId, {
    url: webviews.internalPages.error + '?ec=crash&url=' + encodeURIComponent(url)
  })

  // the existing process has crashed, so we can't reuse it
  webviews.destroy(tabId)
  webviews.add(tabId)

  if (tabId === tabs.getSelected()) {
    webviews.setSelected(tabId)
  }
})

webviews.bindIPC('getSettingsData', function (webview, tabId, args) {
  webview.send('receiveSettingsData', settings.list)
})
webviews.bindIPC('setSetting', function (webview, tabId, args) {
  settings.set(args[0].key, args[0].value)
})

settings.listen(function () {
  tasks.forEach(function (task) {
    task.tabs.forEach(function (tab) {
      if (tab.url.startsWith('file://')) {
        try {
          webviews.get(tab.id).send('receiveSettingsData', settings.list)
        } catch (e) {
          // webview might not actually exist
        }
      }
    })
  })
})

ipc.on('view-event', function (e, args) {
  if (!webviews.tabViewMap[args.viewId]) {
    // the view could have been destroyed between when the event was occured and when it was recieved in the UI process, see https://github.com/minbrowser/min/issues/604#issuecomment-419653437
    return
  }
  webviews.events.forEach(function (ev) {
    if (ev.id === args.eventId) {
      ev.fn.apply(webviews.tabContentsMap[args.viewId], [webviews.tabContentsMap[args.viewId], args.viewId, e].concat(args.args))
    }
  })
})

ipc.on('async-call-result', function (e, args) {
  webviews.asyncCallbacks[args.callId](args.error, args.result)
  delete webviews.asyncCallbacks[args.callId]
})

ipc.on('view-ipc', function (e, args) {
  if (!webviews.tabViewMap[args.id]) {
    // the view could have been destroyed between when the event was occured and when it was recieved in the UI process, see https://github.com/minbrowser/min/issues/604#issuecomment-419653437
    return
  }
  webviews.IPCEvents.forEach(function (item) {
    if (item.name === args.name) {
      item.fn(webviews.tabContentsMap[args.id], args.id, [args.data], args.frameId)
    }
  })
})

setInterval(function () {
  captureCurrentTab()
}, 30000)

ipc.on('captureData', function (e, data) {
  previewCache.set(data.id, data.url)
  if (data.id === webviews.selectedId && webviews.placeholderRequests.length > 0) {
    placeholderImg.src = data.url
    placeholderImg.hidden = false
  }
})

/* focus the view when the window is focused */

ipc.on('windowFocus', function () {
  if (document.activeElement === document.body) {
    webviews.focus()
  }
})


module.exports = webviews
