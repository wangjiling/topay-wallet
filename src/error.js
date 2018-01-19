/**
 * @license
 * https://github.com/bitcoincashjs/topay-wallet
 * Copyright (c) 2018 Emilio Almansi
 * Distributed under the MIT software license, see the accompanying
 * file LICENSE or http://www.opensource.org/licenses/mit-license.php.
 */

export default class TopayError {
  /**
   * An error resulting within the execution of an operation
   * in the {@link TopayWallet}.
   * @param {string} title - Title identifying the error.
   * @param {string} detail - Message describing the error in more detail.
   */
  constructor (title, detail) {
    var error = new Error()
    this.name = error.name = 'TopayError'
    this.message = error.message = `${title}: ${detail}`
    this.stack = error.stack
  }
}
