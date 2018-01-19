/**
 * @license
 * https://github.com/bitcoincashjs/topay-wallet
 * Copyright (c) 2018 Emilio Almansi
 * Distributed under the MIT software license, see the accompanying
 * file LICENSE or http://www.opensource.org/licenses/mit-license.php.
 */

import { checkArgument } from 'conditional'
import axios from 'axios'
import TopayError from './error'

export default class TopayRestClient {
  /**
   * REST client for communicating with an Insight API back-end.
   * @constructor TopayRestClient
   * @param {string} baseUrl
   */
  constructor (baseUrl) {
    checkArgument(typeof baseUrl === 'string', 'baseUrl')
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  /**
   * Retrieves the given address' history, or throws a
   * {@link TopayError} if the request cannot be completed.
   * @param {string} address
   * @returns {object}
   * @throws {TopayError}
   */
  async getAddress (address) {
    const response = await this._get(`/addr/${address}`)
    return response
  }

  /**
   * Retrieves the given address' balance in satoshis, or throws
   * a {@link TopayError} if the request cannot be completed.
   * @param {string} address
   * @returns {number}
   * @throws {TopayError}
   */
  async getBalance (address) {
    const {
      balanceSat,
      unconfirmedBalanceSat
    } = await this.getAddress(address)
    return balanceSat + unconfirmedBalanceSat
  }

  /**
   * Retrieves the given address' unspent outputs (UTXO set), or
   * throws a {@link TopayError} if the request cannot be completed.
   * @param {string} address
   * @returns {Array}
   * @throws {TopayError}
   */
  async getUtxoSet (address) {
    const response = await this._get(`/addr/${address}/utxo`)
    return response
  }

  /**
   * Sends a raw, hex-encoded transaction for broadcasting. Returns
   * the resulting transaction's id, or throws a {@link TopayError}
   * if the request cannot be completed.
   * @param {string} transaction
   * @returns {string}
   * @throws {TopayError}
   */
  async sendTransaction (transaction) {
    const data = {
      rawtx: transaction
    }
    const response = await this._post('/tx/send', data)
    return response.txid
  }

  /**
   * Executes a get request to the given route.
   * Throws a {@link TopayError} if the request or the communication fails.
   * @param {string} route
   * @returns {*}
   * @throws {TopayError}
   */
  async _get (route) {
    const response = await this._unwrap(axios.get(`${this.baseUrl}${route}`))
    return response
  }

  /**
   * Executes a post request to the given route with the given data as body.
   * Throws a {@link TopayError} if the request or the communication fails.
   * @param {string} route
   * @param {object} data
   * @returns {*}
   * @throws {TopayError}
   */
  async _post (route, data) {
    const response = await this._unwrap(axios.post(`${this.baseUrl}${route}`, data))
    return response
  }

  /**
   * Executes an axios request and unwraps either the resulting
   * response or error. Throws a {@link TopayError} if communication
   * with the server fails or if the request results in an error
   * status code.
   * @param {AsyncFunction} request - Request to execute.
   * @returns {*}
   * @throws {TopayError}
   */
  async _unwrap (request) {
    try {
      const response = await request
      return response.data
    } catch (error) {
      const title = 'Communication error'
      if (error.response) {
        const { status, statusText, data } = error.response
        const message = data.indexOf('Code:') !== -1 ? data : statusText
        const detail = [
          `Request failed with status ${status}.`,
          `Message: '${message}'.`
        ].join(' ')
        throw new TopayError(title, detail)
      } else {
        throw new TopayError(title, 'Service unavailable.')
      }
    }
  }
}
