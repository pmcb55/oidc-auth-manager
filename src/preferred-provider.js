'use strict'

const { URL } = require('whatwg-url')
const validUrl = require('valid-url')
const fetch = require('node-fetch')
const li = require('li')

module.exports = {
  discoverProviderFor,
  parseProviderLink,
  preferredProviderFor,
  providerExists,
  validateProviderUri
}

/**
 * @param uri {string} Provider URI or Web ID URI
 *
 * @returns {Promise<string>}
 */
function preferredProviderFor (uri) {
  // First, determine if the uri is an OIDC provider
  return providerExists(uri)
    .then(providerUri => {
      console.log('ProviderUri:', providerUri)
      if (providerUri) {
        return providerUri  // the given uri's origin hosts an OIDC provider
      }

      // Given uri is not a provider (for example, a static Web ID profile URI)
      // Discover its preferred provider
      return discoverProviderFor(uri)
    })
}

/**
 * @param uri {string} Provider URI or Web ID URI
 *
 * @returns {Promise<string|null>} Returns the Provider URI origin if an OIDC
 *   provider exists at the given uri, or `null` if none exists
 */
function providerExists (uri) {
  let providerOrigin = (new URL(uri)).origin
  let providerConfigUri = providerOrigin + '/.well-known/openid-configuration'

  return fetch(providerConfigUri, { method: 'HEAD' })
    .then(result => {
      if (result.ok) {
        return providerOrigin
      }

      return null
    })
}

/**
 *
 * @param uri {string} Web ID URI
 *
 * @returns {Promise<string>} Resolves with the preferred provider uri for the
 *  given Web ID, extracted from Link rel header.
 */
function discoverProviderFor (uri) {
  return fetch(uri, { method: 'OPTIONS' })

    .then(response => {
      if (!response.ok) {
        throw new Error(`Could not fetch ${uri}: ${response.status} ${response.statusText}`)
      }

      return response.headers
    })

    .catch(err => {
      let error = new Error(`Provider not found at uri: ${uri}`)
      error.statusCode = 400
      error.cause = err
      throw error
    })

    .then(headers => parseProviderLink(headers))

    .then(providerUri => {
      validateProviderUri(providerUri, uri)  // Throw an error if invalid

      return providerUri
    })
}

/**
 * Returns the contents of the OIDC issuer Link rel header.
 *
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html#IssuerDiscovery
 *
 * @param headers {Headers} Response headers from an OPTIONS call
 *
 * @return {string}
 */
function parseProviderLink (headers) {
  let links = li.parse(headers.get('link')) || {}

  return links['http://openid.net/specs/connect/1.0/issuer']
}

/**
 * Validates a preferred provider uri (makes sure it's a well-formed URI).
 *
 * @param provider {string} Identity provider URI
 *
 * @throws {Error} If the URI is invalid
 */
function validateProviderUri (provider, webId) {
  if (!provider) {
    let error = new Error(`OIDC issuer not advertised for ${webId}`)
    error.statusCode = 400
    throw error
  }

  if (!validUrl.isUri(provider)) {
    let error = new Error(`OIDC issuer for ${webId} is not a valid URI: ${provider}`)
    error.statusCode = 400
    throw error
  }
}