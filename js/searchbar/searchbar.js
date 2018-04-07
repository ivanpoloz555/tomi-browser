// common regex's

var trailingSlashRegex = /\/$/g

function removeTags (text) {
  return text.replace(/<.*?>/g, '')
}

function openURLInBackground (url) { // used to open a url in the background, without leaving the searchbar
  var newTab = tabs.add({
    url: url,
    private: tabs.get(tabs.getSelected()).private
  }, tabs.getIndex(tabs.getSelected()) + 1)
  addTab(newTab, {
    enterEditMode: false,
    openInBackground: true,
    leaveEditMode: false
  })

  var i = searchbar.querySelector('.searchbar-item:focus')
  if (i) { // remove the highlight from an awesomebar result item, if there is one
    i.blur()
  }
}
// when clicking on a result item, this function should be called to open the URL

function openURLFromSearchbar (url, event) {

  // TODO decide if this should go somewhere else

  // if the url is a !bang search
  if (url.indexOf('!') === 0) {
    // get the matching custom !bang
    var bang = getCustomBang(url)

    if (bang) {
      tabBar.leaveEditMode()
      bang.fn(url.replace(bang.phrase, '').trimLeft())
      // don't open the URL
      return
    }
  }

  if (event && event.metaKey) {
    openURLInBackground(url)
    return true
  } else {
    navigate(tabs.getSelected(), url)
    // focus the webview, so that autofocus inputs on the page work
    webviews.get(tabs.getSelected()).focus()
    return false
  }
}

// attempts to shorten a page title, removing useless text like the site name

function getRealTitle (text) {
  // don't try to parse URL's
  if (urlParser.isURL(text)) {
    return text
  }

  var possibleCharacters = ['|', ':', ' - ', ' — ']

  for (var i = 0; i < possibleCharacters.length; i++) {
    var char = possibleCharacters[i]
    // match url's of pattern: title | website name
    var titleChunks = text.split(char)

    if (titleChunks.length >= 2) {
      titleChunks[0] = titleChunks[0].trim()
      titleChunks[1] = titleChunks[1].trim()

      if (titleChunks[1].length < 5 || titleChunks[1].length / titleChunks[0].length <= 0.5) {
        return titleChunks[0]
      }
    }
  }

  // fallback to the regular title

  return text
}

// swipe left on history items to delete them

var lastItemDeletion = Date.now()

// creates a result item

/*
data:

title: string - the title of the item
metadata: array - a list of strings to include (separated by hyphens) in front of the secondary text
secondaryText: string - the item's secondary text
url: string - the item's url (if there is one).
icon: string - the name of a font awesome icon.
image: string - the URL of an image to show
iconImage: string - the URL of an image to show as an icon
descriptionBlock: string - the text in the description block,
attribution: string - attribution text to display when the item is focused
delete: function - a function to call to delete the result item when a left swipe is detected
classList: array - a list of classes to add to the item
*/

function createSearchbarItem (data) {
  var item = document.createElement('div')
  item.classList.add('searchbar-item')

  item.setAttribute('tabindex', '-1')

  if (data.classList) {
    for (var i = 0; i < data.classList.length; i++) {
      item.classList.add(data.classList[i])
    }
  }

  if (data.icon) {
    var i = document.createElement('i')
    i.className = 'fa' + ' ' + data.icon

    item.appendChild(i)
  }

  if (data.title) {
    var title = document.createElement('span')
    title.classList.add('title')

    title.textContent = data.title

    item.appendChild(title)
  }

  if (data.url) {
    item.setAttribute('data-url', data.url)

    item.addEventListener('click', function (e) {
      openURLFromSearchbar(data.url, e)
    })
  }

  if (data.secondaryText) {
    var secondaryText = document.createElement('span')
    secondaryText.classList.add('secondary-text')

    secondaryText.textContent = data.secondaryText

    item.appendChild(secondaryText)

    if (data.metadata) {
      data.metadata.forEach(function (str) {
        var metadataElement = document.createElement('span')
        metadataElement.className = 'md-info'

        metadataElement.textContent = str

        secondaryText.insertBefore(metadataElement, secondaryText.firstChild)
      })
    }
  }

  if (data.image) {
    var image = document.createElement('img')
    image.className = 'image'
    image.src = data.image

    item.insertBefore(image, item.childNodes[0])
  }

  if (data.iconImage) {
    var iconImage = document.createElement('img')
    iconImage.className = 'icon-image'
    iconImage.src = data.iconImage

    item.insertBefore(iconImage, item.childNodes[0])
  }

  if (data.descriptionBlock) {
    var dBlock = document.createElement('span')
    dBlock.classList.add('description-block')

    dBlock.textContent = data.descriptionBlock
    item.appendChild(dBlock)
  }

  if (data.attribution) {
    var attrBlock = document.createElement('span')
    attrBlock.classList.add('attribution')

    attrBlock.textContent = data.attribution
    item.appendChild(attrBlock)
  }

  if (data.delete) {
    item.addEventListener('mousewheel', function (e) {
      var self = this
      if (e.deltaX > 50 && e.deltaY < 3 && Date.now() - lastItemDeletion > 700) {
        lastItemDeletion = Date.now()

        self.style.opacity = '0'
        self.style.transform = 'translateX(-100%)'

        setTimeout(function () {
          data.delete(self)
          self.parentNode.removeChild(self)
          lastItemDeletion = Date.now()
        }, 200)
      }
    })
  }

  if (data.click) {
    item.addEventListener('click', data.click)
  }

  return item
}

var searchbar = document.getElementById('searchbar')

function showSearchbar (triggerInput) {
  searchbar.hidden = false

  currentSearchbarInput = triggerInput
}

// gets the typed text in an input, ignoring highlighted suggestions

function getValue (input) {
  var text = input.value
  return text.replace(text.substring(input.selectionStart, input.selectionEnd), '')
}

function hidesearchbar () {
  currentSearchbarInput = null
  searchbar.hidden = true

  clearSearchbar()
}
var showSearchbarResults = function (text, input, event) {
  // find the real input value, accounting for highlighted suggestions and the key that was just pressed
  // delete key doesn't behave like the others, String.fromCharCode returns an unprintable character (which has a length of one)

  if (event && event.keyCode !== 8) {
    var realText = text.substring(0, input.selectionStart) + String.fromCharCode(event.keyCode) + text.substring(input.selectionEnd, text.length)
  } else {
    var realText = text
  }

  runPlugins(realText, input, event)
}

function focusSearchbarItem (options) {
  options = options || {} // fallback if options is null
  var previous = options.focusPrevious

  var allItems = [].slice.call(searchbar.querySelectorAll('.searchbar-item:not(.unfocusable)'))
  var currentItem = searchbar.querySelector('.searchbar-item:focus, .searchbar-item.fakefocus')

  var index = allItems.indexOf(currentItem)
  var logicalNextItem = allItems[(previous) ? index - 1 : index + 1]

  // clear previously focused items
  var fakefocus = searchbar.querySelector('.fakefocus')
  if (fakefocus) {
    fakefocus.classList.remove('fakefocus')
  }

  if (currentItem && logicalNextItem) { // an item is focused and there is another item after it, move onto the next one
    logicalNextItem.focus()
  } else if (currentItem) { // the last item is focused, focus the searchbar again
    tabBar.getTabInput(tabs.getSelected()).focus()
    return
  } else if (allItems[0]) { // no item is focused.
    allItems[0].focus()
  }

  var focusedItem = logicalNextItem || allItems[0]

  if (focusedItem && focusedItem.classList.contains('iadata-onfocus')) {
    setTimeout(function () {
      if (document.activeElement === focusedItem) {
        var itext = focusedItem.querySelector('.title').textContent

        showSearchbarInstantAnswers(itext, currentSearchbarInput, null, getSearchbarContainer('instantAnswers'))
      }
    }, 300)
  }
}

// return key on result items should trigger click
// tab key or arrowdown key should focus next item
// arrowup key should focus previous item

searchbar.addEventListener('keydown', function (e) {
  if (e.keyCode === 13) {
    e.target.click()
  } else if (e.keyCode === 9 || e.keyCode === 40) { // tab or arrowdown key
    e.preventDefault()
    focusSearchbarItem()
  } else if (e.keyCode === 38) {
    e.preventDefault()
    focusSearchbarItem({
      focusPrevious: true
    })
  }
})

// when we get keywords data from the page, we show those results in the searchbar

webviews.bindIPC('keywordsData', function (webview, tabId, arguements) {
  var data = arguements[0]

  var itemsCt = 0

  var itemsShown = []

  var container = getSearchbarContainer('searchSuggestions')

  data.entities.forEach(function (item, index) {
    // ignore one-word items, they're usually useless
    if (!/\s/g.test(item.trim())) {
      return
    }

    if (itemsCt >= 5 || itemsShown.indexOf(item.trim()) !== -1) {
      return
    }

    var div = createSearchbarItem({
      icon: 'fa-search',
      title: item,
      classList: ['iadata-onfocus']
    })

    div.addEventListener('click', function (e) {
      if (e.metaKey) {
        openURLInBackground(item)
      } else {
        navigate(tabs.getSelected(), item)
      }
    })

    container.appendChild(div)

    itemsCt++
    itemsShown.push(item.trim())
  })
})
