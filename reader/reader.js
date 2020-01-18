/* Back button */

var backbutton = document.getElementById('backtoarticle')
var articleURL = new URLSearchParams(window.location.search).get('url')
var articleLocation = new URL(articleURL)

backbutton.addEventListener('click', function (e) {
  // there's likely a problem with reader view on this page, so don't auto-redirect to it in the future
  readerDecision.setURLStatus(articleURL, false)

  window.location = articleURL
})

/* Auto redirect banner */
var autoRedirectBanner = document.getElementById('auto-redirect-banner')
var autoRedirectYes = document.getElementById('auto-redirect-yes')
var autoRedirectNo = document.getElementById('auto-redirect-no')

if (readerDecision.getDomainStatus(articleURL) === undefined) {
  autoRedirectBanner.hidden = false
}

autoRedirectYes.addEventListener('click', function () {
  readerDecision.setDomainStatus(articleURL, true)
  autoRedirectBanner.hidden = true
  autoReaderCheckbox.checked = true
})
autoRedirectNo.addEventListener('click', function () {
  readerDecision.setDomainStatus(articleURL, false)
  autoRedirectBanner.hidden = false
})

/* Settings */

var settingsButton = document.getElementById('settings-button')
var settingsDropdown = document.getElementById('settings-dropdown')

settingsButton.addEventListener('click', function () {
  settingsDropdown.hidden = !settingsDropdown.hidden
})

window.addEventListener('blur', function () {
  if (document.activeElement.tagName === 'IFRAME') {
    // clicked on reader frame
    settingsDropdown.hidden = true
  }
})

document.addEventListener('click', function (e) {
  if (!settingsDropdown.contains(e.target) && e.target !== settingsButton) {
    settingsDropdown.hidden = true
  }
})

var autoReaderCheckbox = document.getElementById('auto-reader-checkbox')
autoReaderCheckbox.checked = (readerDecision.getDomainStatus(articleURL) === true)
autoReaderCheckbox.addEventListener('change', function () {
  readerDecision.setDomainStatus(articleURL, this.checked)
  autoRedirectBanner.hidden = true
})

var navLinksContainer = document.getElementById('site-nav-links')

function extractAndShowNavigation (doc) {
  try {
    // URL parsing can fail, but this shouldn't prevent the article from displaying

    let currentDir = articleLocation.pathname.split('/').slice(0, -1).join('/')

    var items = Array.from(doc.querySelectorAll('[class*="menu"] a, [class*="navigation"] a, header li a, [role=tabpanel] a, nav a'))
      .filter(el => {
        let n = el
        while (n) {
          if (n.className.includes('social')) {
            return false
          }
          n = n.parentElement
        }
        return true
      })
      .filter(el => el.getAttribute('href') && !el.getAttribute('href').startsWith('#') && !el.getAttribute('href').startsWith('javascript:'))
      .filter(el => {
        // we want links that go to different sections of the site, so links to the same directory as the current article should be excluded
        let url = new URL(el.href)
        let dir = url.pathname.split('/').slice(0, -1).join('/')
        return dir !== currentDir
      })
      .filter(el => el.textContent.trim() && el.textContent.trim().replace(/\s+/g, ' ').length < 65)

    // remove duplicates
    var itemURLSet = items.map(item => new URL(item.href).toString())
    items = items.filter((item, idx) => itemURLSet.indexOf(new URL(item.href).toString()) === idx)

    // show a maximum of 7 links
    // TODO maybe have a way to show more links (dropdown menu?)
    items.slice(0, 7).forEach(function (item) {
      // need to use articleURL as base URL to parse relative links correctly
      var realURL = new URL(item.getAttribute('href'), articleURL)

      var el = document.createElement('a')
      el.textContent = item.textContent
      el.title = item.textContent
      el.href = realURL.toString()

      // if the link is to a parent directory of this article, assume it links to the section that this article is in
      if (realURL.pathname !== '/' && articleURL.startsWith(realURL.toString())) {
        el.classList.add('selected')
      }

      navLinksContainer.appendChild(el)
    })
  } catch (e) {
    console.warn('error extracting navigation links', e)
  }
}

function extractDate (doc) {
  var date
  var dateItem = doc.querySelector('[itemprop*="dateCreated"], [itemprop*="datePublished"], [property="article:published_time"]')
  if (dateItem) {
    try {
      var d = Date.parse(dateItem.getAttribute('content'))
      if (Number.isNaN(d)) {
        // for <time> elements
        d = Date.parse(dateItem.getAttribute('datetime'))
      }
      if (Number.isNaN(d)) {
        // for washington post
        d = Date.parse(dateItem.textContent)
      }
      date = new Intl.DateTimeFormat(navigator.language, {year: 'numeric', month: 'long', day: 'numeric'}).format(new Date(d))
    } catch (e) {
      console.warn(e)
    }
  } else {
    try {
      // look for a url with a yyyy/mm/dd format
      var urlmatch = articleURL.match(/\/([0-9]{4})\/([0-9]{1,2})\/([0-9]{1,2})/)
      if (urlmatch) {
        var d2 = new Date()
        d2.setYear(parseInt(urlmatch[1]))
        d2.setMonth(parseInt(urlmatch[2]) - 1)
        d2.setDate(parseInt(urlmatch[3]))
        date = new Intl.DateTimeFormat(navigator.language, {year: 'numeric', month: 'long', day: 'numeric'}).format(d2)
      }
    } catch (e) {
      console.warn(e)
    }
  }
  return date
}

function startReaderView (article, date) {
  var readerContent = "<link rel='stylesheet' href='readerContent.css'>"

  if (!article) { // we couln't parse an article
    readerContent += "<div class='reader-main'><em>No article found.</em></div>"
  } else {
    if (article.title) {
      document.title = article.title
    } else {
      document.title = 'Reader View | ' + articleURL
    }

    var readerDomain = articleLocation.hostname

    readerContent += "<div class='reader-main' domain='" + readerDomain + "'>" + "<h1 class='article-title'>" + (article.title || '') + '</h1>'

    if (article.byline || date) {
      readerContent += "<h2 class='article-authors'>" + (article.byline ? article.byline : '') + (date ? ' (' + date + ')' : '') + '</h2>'
    }

    readerContent += article.content + '</div>'
  }

  window.rframe = document.createElement('iframe')
  rframe.classList.add('reader-frame')
  rframe.sandbox = 'allow-same-origin allow-top-navigation allow-modals'
  rframe.srcdoc = readerContent

  // set an initial height equal to the available space in the window
  rframe.height = window.innerHeight - 68

  // resize the frame once the page has loaded and the content height can be determined
  rframe.onload = function () {
    /* add special handling for links */
    var links = rframe.contentDocument.querySelectorAll('a')

    if (links) {
      for (var i = 0; i < links.length; i++) {
        // if the link is to the same page, it needs to be handled differently
        try {
          let href = new URL(links[i].href)
          if (href.hostname === articleLocation.hostname && href.pathname === articleLocation.pathname && href.search === articleLocation.search) {
            links[i].addEventListener('click', function (e) {
              e.preventDefault()
              rframe.contentWindow.location.hash = href.hash
            })
          }
        } catch (e) {}
      }
    }

    setReaderTheme()
    requestAnimationFrame(function () {
      rframe.height = rframe.contentDocument.body.querySelector('.reader-main').scrollHeight + 'px'
      requestAnimationFrame(function () {
        rframe.focus() // allows spacebar page down and arrow keys to work correctly
      })
    })
  }

  // save the scroll position at intervals

  setInterval(function () {
    updateExtraData(articleURL, {
      scrollPosition: window.pageYOffset,
      articleScrollLength: rframe.contentDocument.body.scrollHeight
    })
  }, 10000)

  document.body.appendChild(rframe)
}

function processArticle (data) {
  var parserframe = document.createElement('iframe')
  parserframe.className = 'temporary-frame'
  parserframe.sandbox = 'allow-same-origin'
  document.body.appendChild(parserframe)

  parserframe.srcdoc = data

  parserframe.onload = function () {
    // allow readability to parse relative links correctly
    var b = document.createElement('base')
    b.href = articleURL
    parserframe.contentDocument.head.appendChild(b)

    var doc = parserframe.contentDocument

    // in order for links to work correctly, they all need to open in a new tab

    var links = doc.querySelectorAll('a')

    if (links) {
      for (var i = 0; i < links.length; i++) {
        links[i].target = '_top'
      }
    }

    /* site-specific workarounds */

    // needed for wikipedia.org

    var images = Array.from(doc.getElementsByTagName('img'))

    if (articleLocation.hostname.includes('wikipedia.org')) {
      images.forEach(function (image) {
        if (image.src && image.srcset) {
          image.srcset = ''
        }
      })
    }

    if (articleLocation.hostname === 'medium.com') {
    // medium.com - show high-resolution images
      var mediumImageRegex = /(?<=https?:\/\/miro.medium.com\/max\/)([0-9]+)(?=\/)/
      images.forEach(function (image) {
        if (image.src) {
          // for gifs
          image.src = image.src.replace('/freeze/', '/')
          if (mediumImageRegex.test(image.src)) {
            image.src = image.src.replace(mediumImageRegex, '2000')
          }
        } else {
          // empty images (for lazy loading) mess up paragraph spacing
          image.remove()
        }
      })
    }

    extractAndShowNavigation(doc)
    var date = extractDate(doc)

    var article = new Readability(doc).parse()
    console.log(article)
    startReaderView(article, date)

    if (article) {
      // mark this page as readerable so that auto-redirect can happen faster on future visits
      readerDecision.setURLStatus(articleURL, true)
    }

    document.body.removeChild(parserframe)

    saveArticle(articleURL, article, {
      scrollPosition: 0,
      articleScrollLength: null
    })
  }
}

fetch(articleURL, {
  credentials: 'include',
  cache: 'force-cache'
})
  .then(function (response) {
    return response.text()
  })
  .then(processArticle)
  .catch(function (data) {
    console.warn('request failed with error', data)

    getArticle(articleURL, function (item) {
      if (item) {
        console.log('offline article found, displaying')
        startReaderView(item.article)
      } else {
        startReaderView({
          content: '<em>Failed to load article.</em>'
        })
      }
    })
  })

function printArticle () {
  rframe.contentWindow.print()
}

/* these functions are called from the parent process */

var parentProcessActions = {
  printArticle: printArticle
}
