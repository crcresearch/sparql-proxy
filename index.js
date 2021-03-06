const bodyParser = require('body-parser')
const cloneDeep = require('lodash/cloneDeep')
const debug = require('debug')
const defaults = require('lodash/defaults')
const fetch = require('node-fetch')
const Router = require('express').Router
const SparqlHttpClient = require('sparql-http-client')
SparqlHttpClient.fetch = fetch

if (debug.enabled('trifid:*,')) {
  const enabled = debug.disable()
  debug.enable(`${enabled},sparql-proxy`)
}

const logger = debug('sparql-proxy')

function authBasicHeader (user, password) {
  return 'Basic ' + Buffer.from(user + ':' + password).toString('base64')
}

function sparqlProxy (options) {
  const queryOptions = {}

  if (options.fetchOptions) {
    Object.assign(queryOptions, options.fetchOptions)
  }

  if (options.authentication) {
    queryOptions.headers = {
      Authorization: authBasicHeader(options.authentication.user, options.authentication.password)
    }
  }

  let queryOperation = options.queryOperation || 'postQueryDirect'
  const client = new SparqlHttpClient({ endpointUrl: options.endpointUrl, updateUrl: options.endpointUrl + '/update' })

  return (req, res, next) => {
    let query
    let isUpdate = false
    let contentType = 'application/sparql-query'

    if (req.method === 'GET') {
      query = req.query.query
      if( req.query.update ) {
        isUpdate = true
        contentType = 'application/sparql-update'
      }
    } else if (req.method === 'POST') {
      query = req.body.query || req.body
      if( req.body.update ) {
        isUpdate = true
        contentType = 'application/sparql-update'
      }
    } else {
      next()
      return
    }

    logger('handle SPARQL request for endpoint: ' + options.endpointUrl)
    if (query) {
      logger('SPARQL query:' + query)
    } else {
      logger('No SPARQL query; issuing a GET')
      queryOperation = 'getQuery'
    }

    // merge configuration query options with request query options
    var currentQueryOptions = defaults(cloneDeep(queryOptions), { accept: req.headers.accept, update: isUpdate, contentType: contentType})

    const timeStart = Date.now()
    return client[queryOperation](query, currentQueryOptions).then((result) => {
      const time = Date.now() - timeStart
      result.headers.forEach((value, name) => {
        res.setHeader(name, value)
      })

      // content gets decoded, so remove encoding headers and recalculate length
      res.removeHeader('content-encoding')
      res.removeHeader('content-length')

      result.body.pipe(res)
      if (debug.enabled('sparql-proxy')) {
        return result.text().then((text) => {
          logger(`HTTP${result.status} in ${time}ms; body: ${text}`)
        })
      }
    }).catch(next)
  }
}

function factory (options) {
  const router = new Router()

  router.use(bodyParser.text({ type: 'application/sparql-query' }))
  router.use(bodyParser.urlencoded({ extended: false }))
  router.use(sparqlProxy(options))

  return router
}

module.exports = factory
