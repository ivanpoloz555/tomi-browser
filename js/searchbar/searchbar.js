const EventEmitter = require('events')

var webviews = require('webviews.js')
var keybindings = require('keybindings.js')
var urlParser = require('util/urlParser.js')
var searchbarPlugins = require('searchbar/searchbarPlugins.js')
var ensPlugin = require('searchbar/ensPlugin.js')
var keyboardNavigationHelper = require('util/keyboardNavigationHelper.js')

function openURLInBackground(url) { // used to open a url in the background, without leaving the searchbar
  searchbar.events.emit('url-selected', { url: url, background: true })

  var i = searchbar.el.querySelector('.searchbar-item:focus')
  if (i) { // remove the highlight from an awesomebar result item, if there is one
    i.blur()
  }
}

var searchbar = {
  el: document.getElementById('searchbar'),
  associatedInput: null,
  events: new EventEmitter(),
  show: function (associatedInput) {
    searchbar.el.hidden = false
    searchbar.associatedInput = associatedInput
  },
  hide: function () {
    searchbar.associatedInput = null
    searchbar.el.hidden = true

    searchbarPlugins.clearAll()
  },
  getValue: function () {
    var text = searchbar.associatedInput.value
    return text.replace(text.substring(searchbar.associatedInput.selectionStart, searchbar.associatedInput.selectionEnd), '')
  },
  showResults: function (text, inputFlags = {}) {
    searchbarPlugins.run(text, searchbar.associatedInput, inputFlags)
  },
  openURL: async function (url, event) {
    if (ensPlugin.checkEns(url)) {
      const newUrl = await ensPlugin.resolveEns(url);
      if (newUrl) {
        searchbar.events.emit('url-selected', { url: newUrl, background: false })
        // focus the webview, so that autofocus inputs on the page work
        webviews.focus()
        return false
      }
    }
    var hasURLHandler = searchbarPlugins.runURLHandlers(url)
    if (hasURLHandler) {
      return
    }

    if (event && (window.platformType === 'mac' ? event.metaKey : event.ctrlKey)) {
      openURLInBackground(url)
      return true
    } else {
      searchbar.events.emit('url-selected', { url: url, background: false })
      // focus the webview, so that autofocus inputs on the page work
      webviews.focus()
      return false
    }
  }
}

keyboardNavigationHelper.addToGroup('searchbar', searchbar.el)

// mod+enter navigates to searchbar URL + ".com"
keybindings.defineShortcut('completeSearchbar', function () {
  if (searchbar.associatedInput) { // if the searchbar is open
    var value = searchbar.associatedInput.value

    // if the text is already a URL, navigate to that page
    if (urlParser.isPossibleURL(value)) {
      searchbar.events.emit('url-selected', { url: value, background: false })
    } else {
      searchbar.events.emit('url-selected', { url: urlParser.parse(value + '.com'), background: false })
    }
  }
})

searchbarPlugins.initialize(searchbar.openURL)

module.exports = searchbar
