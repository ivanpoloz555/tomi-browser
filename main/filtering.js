var thingsToFilter = {
  blockingLevel: 0,
  contentTypes: [], // script, image
  exceptionDomains: []
}

var parser = require('./ext/abp-filter-parser-modified/abp-filter-parser.js')
var parsedFilterData = {}

function initFilterList () {
  var data = require('fs').readFile(__dirname + '/ext/filterLists/easylist+easyprivacy-noelementhiding.txt', 'utf8', function (err, data) {
    if (err) {
      return
    }

    // data = data.replace(/.*##.+\n/g, '') // remove element hiding rules

    parser.parse(data, parsedFilterData)
  })
}

function requestIsThirdParty (baseDomain, requestURL) {
  var requestDomain = parser.getUrlHost(requestURL)
  if (baseDomain.startsWith('www.')) {
    baseDomain = baseDomain.replace('www.', '')
  }
  if (requestDomain.startsWith('www.')) {
    requestDomain = requestDomain.replace('www.', '')
  }
  return !(parser.isSameOriginHost(baseDomain, requestDomain) || parser.isSameOriginHost(requestDomain, baseDomain))
}

function requestDomainIsException (domain) {
  if (domain.startsWith('www.')) {
    domain = domain.replace('www.', '')
  }
  return thingsToFilter.exceptionDomains.includes(domain)
}

function handleRequest (details, callback) {
  if (!(details.url.startsWith('http://') || details.url.startsWith('https://')) || details.resourceType === 'mainFrame') {
    callback({
      cancel: false,
      requestHeaders: details.requestHeaders
    })
    return
  }

  // block javascript and images if needed

  if (thingsToFilter.contentTypes.length > 0) {
    for (var i = 0; i < thingsToFilter.contentTypes.length; i++) {
      if (details.resourceType === thingsToFilter.contentTypes[i]) {
        callback({
          cancel: true,
          requestHeaders: details.requestHeaders
        })
        return
      }
    }
  }

  if (details.webContentsId) {
    var domain = parser.getUrlHost(webContents.fromId(details.webContentsId).getURL())
  } else {
    // webContentsId may not exist if this request is for the main document of a subframe
    var domain = undefined
  }

  if (thingsToFilter.blockingLevel > 0 && !(domain && requestDomainIsException(domain))) {
    if (
      (thingsToFilter.blockingLevel === 1 && (!domain || requestIsThirdParty(domain, details.url)))
      || (thingsToFilter.blockingLevel === 2)
    ) {
      // by doing this check second, we can skip checking same-origin requests if only third-party blocking is enabled
      var matchesFilters = parser.matches(parsedFilterData, details.url, {
        domain: domain,
        elementType: details.resourceType
      })
      if (matchesFilters) {
        callback({
          cancel: true,
          requestHeaders: details.requestHeaders
        })
        return
      }
    }
  }

  callback({
    cancel: false,
    requestHeaders: details.requestHeaders
  })
}

function setFilteringSettings (settings) {
  if (!settings) {
    settings = {}
  }

  if (settings.blockingLevel > 0 && !(thingsToFilter.blockingLevel > 0)) { // we're enabling tracker filtering
    initFilterList()
  }

  thingsToFilter.contentTypes = settings.contentTypes || []
  thingsToFilter.blockingLevel = settings.blockingLevel || 0
  thingsToFilter.exceptionDomains = settings.exceptions || []
}

function registerFiltering (ses) {
  if (ses) {
    ses = session.fromPartition(ses)
  } else {
    ses = session.defaultSession
  }

  ses.webRequest.onBeforeRequest(handleRequest)
}

ipc.on('setFilteringSettings', function (e, settings) {
  setFilteringSettings(settings)
})

ipc.on('registerFiltering', function (e, ses) {
  registerFiltering(ses)
})
