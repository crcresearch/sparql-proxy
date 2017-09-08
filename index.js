const bodyParser = require('body-parser')
const cloneDeep = require('lodash/cloneDeep')
const defaults = require('lodash/defaults')
const Router = require('express').Router
const SparqlHttpClient = require('sparql-http-client')

SparqlHttpClient.fetch = require('node-fetch')

function authBasicHeader (user, password) {
  return 'Basic ' + new Buffer(user + ':' + password).toString('base64')
}

function sparqlProxy (options) {
  const queryOptions = {}

  if (options.authentication) {
    queryOptions.headers = {
      Authorization: authBasicHeader(options.authentication.user, options.authentication.password)
    }
  }

  const queryOperation = options.queryOperation || 'postQueryDirect'
  const client = new SparqlHttpClient({endpointUrl: options.endpointUrl})

  return (req, res, next) => {
    let query

    if (req.method === 'GET') {
      query = req.query.query
    } else if (req.method === 'POST') {
      query = req.body.query || req.body
    } else {
      return next()
    }

    console.log('handle SPARQL request for endpoint: ' + options.endpointUrl)
    console.log('SPARQL query:' + query)

    // merge configuration query options with request query options
    const currentQueryOptions = defaults(cloneDeep(queryOptions), {accept: req.headers.accept})

    return client[queryOperation](query, currentQueryOptions).then((result) => {
      result.headers.forEach((value, name) => {
        res.setHeader(name, value)
      })

      // content gets decoded, so remove encoding headers and recalculate length
      res.removeHeader('content-encoding')
      res.removeHeader('content-length')

      result.body.pipe(res)
    }).catch(next)
  }
}

function factory (options) {
  const router = new Router()

  router.use(bodyParser.text({type: 'application/sparql-query'}))
  router.use(bodyParser.urlencoded({extended: false}))
  router.use(sparqlProxy(options))

  return router
}

module.exports = factory
